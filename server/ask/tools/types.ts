// Tool contract (04-implementation-plan.md §3.3). Every tool in
// server/ask/tools/ implements this shape; the loop (server/ask/loop.ts)
// only ever calls tools through the registry, never directly.
import type { z } from "zod";
import type { Brand } from "@shared/schema";
import type { AskBlock, EvidenceItem } from "@shared/ask/blocks";

// Per-run memo: the same read computed by more than one tool (or already
// computed before the loop even started, in server/ask/context.ts) is
// computed at most once per run. `RunMemo.seed` is how context.ts hands a
// value it already paid for - the hero and core-competitor reads - to
// whichever tool asks for it first; `get` is the general "compute once,
// share within this run" path for anything not seeded.
//
// Deliberately NOT cross-run or cross-request: a new RunMemo is constructed
// per call to runAskLoop (server/ask/loop.ts), so nothing here can leak one
// user's data into another run, and nothing needs its own expiry - the
// whole thing is garbage the moment the run's closures fall out of scope.
export class RunMemo {
  private readonly cache = new Map<string, Promise<unknown>>();

  seed<T>(key: string, value: T): void {
    this.cache.set(key, Promise.resolve(value));
  }

  get<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const existing = this.cache.get(key);
    if (existing) return existing as Promise<T>;
    const promise = compute();
    this.cache.set(key, promise);
    return promise;
  }
}

export type AskToolContext = {
  userId: string;
  // Resolved from the run's thread/brand selection, NEVER from model
  // arguments (04 §3.3, 07 §6). A model-supplied brandId is structurally
  // impossible to honour because no tool accepts one as input.
  brandId: string;
  brand: Brand;
  signal: AbortSignal;
  // read_page's allowlist (04 §3.3, round-2 decision 4: own domain +
  // competitor domains + hosts already present in cited geo_rankings rows).
  // Computed LAZILY, at most once per run, the first time any tool actually
  // calls read_page - most runs never call it at all, and the query behind
  // it (every host this brand's tracked prompts have ever been cited on)
  // is real database work worth skipping when nothing needs it.
  getReadPageAllowlist: () => Promise<ReadonlySet<string>>;
  // Bumped by read_page on every successful fetch; read by the loop after
  // the run to populate the "N pages read" step-bar metric
  // (01-trakkr-teardown.md R3) and the `done` event's pagesRead field.
  incrementPagesRead: () => void;
  memo: RunMemo;
};

export type AskToolResult<O> = {
  data: O; // goes back to the model as JSON
  summary: string; // one line, shown in the step row
  block?: AskBlock;
  evidence?: EvidenceItem[];
  status: "ok" | "failed";
};

export type AskTool<I = unknown, O = unknown> = {
  name: string;
  description: string; // written for the model
  label: string; // written for the user: "Mapping competitors"
  category: string; // step-bar summary grouping ("competitors", "prompts", ...)
  input: z.ZodType<I>;
  costHint: "cheap" | "network";
  run(ctx: AskToolContext, input: I): Promise<AskToolResult<O>>;
};

// A tool's run() must never throw to the loop - a dead tool must not kill a
// run (04 §3.3). Wrap any tool body that can throw with this so a bug in one
// tool degrades that one step instead of the whole run.
export async function runToolSafely<O>(
  toolName: string,
  fn: () => Promise<AskToolResult<O>>,
): Promise<AskToolResult<O>> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: { error: message } as unknown as O,
      summary: `${toolName} failed: ${message}`.slice(0, 200),
      status: "failed",
    };
  }
}
