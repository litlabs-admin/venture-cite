import { cn } from "@/lib/utils";

export type StatusDotTone = "neutral" | "brand" | "ok" | "warn" | "bad";

export type StatusDotProps = {
  tone?: StatusDotTone;
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

const toneClasses: Record<StatusDotTone, string> = {
  neutral: "bg-[var(--v2-ink4)]",
  brand: "bg-[var(--v2-brand)]",
  ok: "bg-[var(--v2-ok)]",
  warn: "bg-[var(--v2-warn)]",
  bad: "bg-[var(--v2-bad)]",
};

export function StatusDot({ tone = "neutral", label, size = "sm", className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[12.5px] text-[color:var(--v2-ink2)]",
        className,
      )}
    >
      <span
        aria-hidden={label ? true : undefined}
        aria-label={label}
        className={cn(
          "shrink-0 rounded-full",
          toneClasses[tone],
          size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2",
        )}
        data-tone={tone}
        role={label ? undefined : "img"}
      />
      {label ? <span>{label}</span> : null}
    </span>
  );
}
