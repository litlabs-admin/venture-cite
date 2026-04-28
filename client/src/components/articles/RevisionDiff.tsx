import { useMemo } from "react";
import { diffLines, diffStats, type DiffLine } from "@/lib/diff";

// Renders a unified line-level diff: removed lines in red, added lines in
// green, unchanged lines in muted text. Used by the Article ViewEdit
// dialog's "Versions" tab and the post-Auto-Improve diff confirmation.
//
// Unified style (not side-by-side) because long article lines wrap awkwardly
// in side-by-side and we want this to be skim-friendly inside a Dialog.

interface RevisionDiffProps {
  before: string;
  after: string;
  /** Optional cap on how many context lines to render around changes. */
  context?: number;
}

export default function RevisionDiff({ before, after, context }: RevisionDiffProps) {
  const lines = useMemo(() => diffLines(before, after), [before, after]);
  const stats = useMemo(() => diffStats(lines), [lines]);

  // If a context window is set, collapse runs of >context equal lines into
  // a "… N unchanged lines …" stub. Skipped lines aren't rendered at all.
  const rendered = useMemo<Array<DiffLine | { op: "skip"; count: number }>>(() => {
    if (context === undefined) return lines;
    const out: Array<DiffLine | { op: "skip"; count: number }> = [];
    let i = 0;
    while (i < lines.length) {
      if (lines[i].op !== "equal") {
        out.push(lines[i]);
        i++;
        continue;
      }
      // Run of equal lines.
      let j = i;
      while (j < lines.length && lines[j].op === "equal") j++;
      const runLen = j - i;
      const hasPrev = out.length > 0; // pad before the run with up to `context`
      const hasNext = j < lines.length; // pad after the run with up to `context`
      const padBefore = hasPrev ? Math.min(context, runLen) : 0;
      const padAfter = hasNext ? Math.min(context, runLen - padBefore) : 0;
      for (let k = i; k < i + padBefore; k++) out.push(lines[k]);
      const middleLen = runLen - padBefore - padAfter;
      if (middleLen > 0) out.push({ op: "skip", count: middleLen });
      for (let k = j - padAfter; k < j; k++) out.push(lines[k]);
      i = j;
    }
    return out;
  }, [lines, context]);

  if (stats.added === 0 && stats.removed === 0) {
    return (
      <div className="text-sm text-muted-foreground italic p-4 border rounded-md">
        No changes between these versions.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        <span className="text-green-600 dark:text-green-400 font-medium">+{stats.added}</span>{" "}
        <span className="text-red-600 dark:text-red-400 font-medium">−{stats.removed}</span>
      </div>
      <pre className="text-xs font-mono leading-relaxed border rounded-md bg-muted p-3 overflow-x-auto max-h-[60vh]">
        {rendered.map((l, idx) => {
          if ((l as { op: "skip" }).op === "skip") {
            const skipped = (l as { count: number }).count;
            return (
              <div key={`skip-${idx}`} className="text-muted-foreground italic">
                ⋯ {skipped} unchanged line{skipped === 1 ? "" : "s"} ⋯
              </div>
            );
          }
          const line = l as DiffLine;
          const cls =
            line.op === "added"
              ? "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
              : line.op === "removed"
                ? "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20"
                : "text-muted-foreground";
          const prefix = line.op === "added" ? "+ " : line.op === "removed" ? "− " : "  ";
          return (
            <div key={idx} className={`whitespace-pre-wrap ${cls}`}>
              {prefix}
              {line.text}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
