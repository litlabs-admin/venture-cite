import { cn } from "@/lib/utils";

export type V2Tone = "neutral" | "brand" | "ok" | "warn" | "bad" | "outline";

export const v2FocusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v2-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--v2-paper)]";

export const v2ToneClasses: Record<V2Tone, string> = {
  neutral: "bg-[var(--v2-inset)] text-[color:var(--v2-ink2)]",
  brand: "bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)]",
  ok: "bg-[var(--v2-ok-soft)] text-[color:var(--v2-ok)]",
  warn: "bg-[var(--v2-warn-soft)] text-[color:var(--v2-warn)]",
  bad: "bg-[var(--v2-bad-soft)] text-[color:var(--v2-bad)]",
  outline: "border border-[var(--v2-line2)] bg-[var(--v2-paper)] text-[color:var(--v2-ink2)]",
};

export const v2ControlClasses = cn(
  "rounded-[var(--v2-radius)] border border-[var(--v2-line)] bg-[var(--v2-paper)] text-[color:var(--v2-ink)]",
  v2FocusRing,
  "disabled:cursor-not-allowed disabled:bg-[var(--v2-disabled-bg)] disabled:text-[color:var(--v2-ink4)]",
);

export function clampPercent(value: number, max = 100): number {
  if (!Number.isFinite(value) || max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

export function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}
