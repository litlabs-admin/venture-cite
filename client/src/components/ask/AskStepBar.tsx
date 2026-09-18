// Step bar: running (live rows with a spinner) and collapsed (one summary
// line) states. Fixes two Trakkr bugs we chose to fix
// (docs/ask-feature/04-implementation-plan.md §0):
//   - I4: categories are deduplicated before the "+N" overflow, so we never
//     produce Trakkr's observed "...visibility, competitor" duplicate.
//   - Status icon reflects ok/degraded/failed, not just a static checkmark.
//
// Row entrance + the running->done icon swap are framer-motion (already a
// dependency) - each new step slides in as it starts, and its icon crossfades
// to a check the moment `step_result` lands, matching beautifului.dev's
// "task rows" reference (live agent task status, running -> completed).
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AskStepView } from "@/hooks/useAskRun";

export function formatDuration(ms: number | null): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function dedupedCategories(steps: AskStepView[]): { shown: string[]; overflow: number } {
  const seen: string[] = [];
  for (const s of steps) {
    if (!seen.includes(s.category)) seen.push(s.category);
  }
  const shown = seen.slice(0, 3);
  return { shown, overflow: Math.max(0, seen.length - shown.length) };
}

function StepRowIcon({ status }: { status: AskStepView["status"] }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {status === "running" ? (
        <motion.span
          key="running"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.15 }}
          className="flex shrink-0"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-vc-tertiary" />
        </motion.span>
      ) : (
        <motion.span
          key={status}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: "backOut" }}
          className="flex shrink-0"
        >
          {status === "failed" ? (
            <XCircle className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
          )}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export function AskStepBar({
  steps,
  running,
  runStatus,
  durationMs,
  pagesRead,
}: {
  steps: AskStepView[];
  running: boolean;
  runStatus: "running" | "ok" | "degraded" | "stopped" | "error";
  durationMs: number | null;
  pagesRead: number;
}) {
  const [expanded, setExpanded] = useState(running);
  if (steps.length === 0) return null;

  const { shown, overflow } = dedupedCategories(steps);
  const StatusIcon =
    runStatus === "degraded" ? AlertTriangle : runStatus === "error" ? XCircle : CheckCircle2;
  const statusColor =
    runStatus === "degraded"
      ? "text-amber-500"
      : runStatus === "error"
        ? "text-destructive"
        : "text-positive";

  return (
    <div className="mb-3 rounded-md border border-vc-default bg-vc-surface">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-caption text-vc-secondary hover:bg-vc-hover"
        aria-expanded={expanded}
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-vc-tertiary" />
        ) : (
          <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", statusColor)} />
        )}
        <span className="font-medium text-vc-primary">
          {steps.length} step{steps.length === 1 ? "" : "s"}
        </span>
        {pagesRead > 0 && (
          <span className="text-vc-tertiary">
            · {pagesRead} page{pagesRead === 1 ? "" : "s"} read
          </span>
        )}
        <span className="truncate text-vc-tertiary">
          · Reviewed {shown.join(", ")}
          {overflow > 0 ? ` +${overflow}` : ""}
        </span>
        <span className="ml-auto shrink-0 font-mono text-vc-tertiary tabular-nums">
          {formatDuration(durationMs)}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-vc-tertiary" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-vc-tertiary" />
        )}
      </button>
      {expanded && (
        <ul className="border-t border-vc-default px-3 py-2" aria-live="polite">
          <AnimatePresence initial={false}>
            {steps.map((s) => (
              <motion.li
                key={s.stepId}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex items-center gap-2 py-1 text-caption"
              >
                <StepRowIcon status={s.status} />
                <span className="text-vc-secondary">{s.label}</span>
                {s.summary && <span className="truncate text-vc-tertiary">— {s.summary}</span>}
                <span className="ml-auto shrink-0 font-mono text-vc-tertiary tabular-nums">
                  {formatDuration(s.durationMs)}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
