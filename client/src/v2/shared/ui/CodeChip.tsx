import { V2Icon } from "@/v2/theme/V2Icon";
import { cn } from "@/lib/utils";
import { v2FocusRing } from "./shared";

export type CodeChipProps = {
  value: string;
  onCopy?: (value: string) => void;
  className?: string;
};

export function CodeChip({ value, onCopy, className }: CodeChipProps) {
  const copyValue = () => {
    if (onCopy) {
      onCopy(value);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(value);
    }
  };

  return (
    <button
      aria-label={`Copy ${value}`}
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-[var(--v2-radius)] border border-[var(--v2-line)] bg-[var(--v2-inset)] px-2.5 py-1.5 text-left font-mono text-[12px] text-[color:var(--v2-ink2)]",
        v2FocusRing,
        className,
      )}
      onClick={copyValue}
      type="button"
    >
      <span className="min-w-0 truncate">{value}</span>
      <V2Icon name="doc" size={14} className="shrink-0 text-[color:var(--v2-ink3)]" />
    </button>
  );
}
