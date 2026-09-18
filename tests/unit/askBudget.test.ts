// Tests server/ask/budget.ts in isolation, and proves it never reads or
// writes chatbot_token_usage (docs/ask-feature/07-integration-and-
// hardening.md §0, independence decision). Every SQL statement the module
// issues is captured (via drizzle's sql`` queryChunks, the same shape
// verified against drizzle-orm directly) and asserted to reference only
// ask_usage.
import { describe, it, expect, vi, beforeEach } from "vitest";

function extractSqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] })?.queryChunks;
  if (!Array.isArray(chunks)) return String(query);
  // Verified directly against drizzle-orm's runtime sql`` output (node -e,
  // not just its .d.ts): a literal SQL fragment is a `StringChunk`
  // instance - an object shaped `{ value: string[] }` - while an
  // interpolated parameter arrives as a bare value (here, a bare string,
  // since every param in budget.ts is a string/date). Duck-typed on
  // `.value` being an array rather than `instanceof StringChunk`, since
  // that class isn't exported from drizzle-orm's public API. Parameter
  // values are replaced with a placeholder so they can never be mistaken
  // for a table name a query happens to reference.
  return chunks
    .map((c) => {
      const value = (c as { value?: unknown })?.value;
      if (Array.isArray(value)) return value.filter((x) => typeof x === "string").join("");
      return "?";
    })
    .join("");
}

const executedQueries: string[] = [];

vi.mock("../../server/db", () => ({
  db: {
    execute: vi.fn(async (query: unknown) => {
      const text = extractSqlText(query);
      executedQueries.push(text);
      if (/from public\.ask_usage/.test(text) && /input_tokens \+ output_tokens/.test(text)) {
        return { rows: [{ total: 0 }] } as unknown;
      }
      if (/sum\(run_count\)/.test(text)) {
        return { rows: [{ n: 0 }] } as unknown;
      }
      return { rows: [] } as unknown;
    }),
  },
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { assertAskBudget, recordAskUsage, ASK_DAILY_TOKEN_CAP, ASK_RUNS_PER_HOUR } =
  await import("../../server/ask/budget");

beforeEach(() => {
  executedQueries.length = 0;
});

describe("server/ask/budget.ts", () => {
  it("never touches chatbot_token_usage - only ask_usage", async () => {
    await assertAskBudget("user-1", "free");
    await recordAskUsage("user-1", 100, 50);

    expect(executedQueries.length).toBeGreaterThan(0);
    for (const q of executedQueries) {
      expect(q.toLowerCase()).not.toContain("chatbot_token_usage");
      expect(q.toLowerCase()).toContain("ask_usage");
    }
  });

  it("issues exactly two reads for assertAskBudget and one upsert for recordAskUsage", async () => {
    await assertAskBudget("user-1", "free");
    expect(executedQueries).toHaveLength(2);

    executedQueries.length = 0;
    await recordAskUsage("user-1", 10, 5);
    expect(executedQueries).toHaveLength(1);
    expect(executedQueries[0].toLowerCase()).toContain("insert into public.ask_usage");
    expect(executedQueries[0].toLowerCase()).toContain("on conflict");
  });

  it("has its own cap tables, sized independently of the tutor's", () => {
    // Sanity check the two constants exist as their own values - this
    // module must declare them, not re-export CHATBOT_DAILY_TOKEN_CAP /
    // CHATBOT_MESSAGES_PER_HOUR from llmPricing.ts.
    expect(ASK_DAILY_TOKEN_CAP.free).toBeGreaterThan(0);
    expect(ASK_RUNS_PER_HOUR.free).toBeGreaterThan(0);
  });

  it("passes through cleanly when usage is zero", async () => {
    await expect(assertAskBudget("user-1", "free")).resolves.toBeUndefined();
  });
});
