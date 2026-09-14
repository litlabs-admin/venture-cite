import { cn } from "@/lib/utils";

export type BrandMarkProps = {
  letter: string;
  label?: string;
  className?: string;
};

export function BrandMark({ letter, label, className }: BrandMarkProps) {
  return (
    <span
      aria-label={label}
      className={cn(
        "inline-grid h-7 w-7 shrink-0 place-items-center rounded-[5px] bg-[var(--v2-brand)] text-[12px] font-bold text-[color:var(--v2-paper)]",
        className,
      )}
      role={label ? "img" : undefined}
    >
      {letter}
    </span>
  );
}
