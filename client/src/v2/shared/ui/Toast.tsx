import type { ReactNode } from "react";
import { V2Icon } from "@/v2/theme/V2Icon";
import { cn } from "@/lib/utils";
import { v2ToneClasses, type V2Tone } from "./shared";

export type ToastProps = {
  message: ReactNode;
  title?: ReactNode;
  tone?: V2Tone;
  action?: ReactNode;
  className?: string;
};

const icons: Record<V2Tone, "q" | "check" | "warn"> = {
  neutral: "q",
  brand: "q",
  ok: "check",
  warn: "warn",
  bad: "warn",
  outline: "q",
};

export function Toast({ message, title, tone = "neutral", action, className }: ToastProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--v2-radius)] border border-transparent px-3.5 py-3 text-[12.5px] leading-[1.45]",
        v2ToneClasses[tone],
        className,
      )}
      role="status"
    >
      <V2Icon name={icons[tone]} size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <div className="mb-0.5 font-semibold">{title}</div> : null}
        <div>{message}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
