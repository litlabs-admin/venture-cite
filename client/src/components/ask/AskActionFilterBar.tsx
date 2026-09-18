// Filter bar. Fixes I10 (04-implementation-plan.md §4.5): Trakkr's row is
// All/Pending/Done/Errors where All=Pending+Done but Errors counts failed
// STEPS, not action cards, so All != Pending+Done+Errors
// (01-trakkr-teardown.md R2). Same four labels, but Errors sits after a
// divider, outside the action-card group, so All stays the sum of the
// group it's actually part of.
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type AskActionFilter = "all" | "pending" | "done";

export function AskActionFilterBar({
  filter,
  onChange,
  pendingCount,
  doneCount,
  errorCount,
}: {
  filter: AskActionFilter;
  onChange: (f: AskActionFilter) => void;
  pendingCount: number;
  doneCount: number;
  errorCount: number;
}) {
  const allCount = pendingCount + doneCount;
  if (allCount === 0 && errorCount === 0) return null;

  const Chip = ({
    value,
    label,
    count,
  }: {
    value: AskActionFilter;
    label: string;
    count: number;
  }) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        "rounded-full px-2.5 py-1 text-caption",
        filter === value
          ? "bg-primary text-primary-foreground"
          : "text-vc-secondary hover:bg-vc-hover",
      )}
    >
      {label} {count}
    </button>
  );

  return (
    <div className="mb-3 flex items-center gap-1 border-b border-vc-default pb-2">
      <Chip value="all" label="All" count={allCount} />
      <Chip value="pending" label="Pending" count={pendingCount} />
      <Chip value="done" label="Done" count={doneCount} />
      {errorCount > 0 && (
        <>
          <span className="mx-1 h-4 w-px bg-vc-default" />
          <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-caption text-amber-600">
            <AlertTriangle className="h-3 w-3" />
            Errors {errorCount}
          </span>
        </>
      )}
    </div>
  );
}
