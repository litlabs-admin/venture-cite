import type { ReactNode } from "react";
import { V2Icon } from "@/v2/theme/V2Icon";
import { cn } from "@/lib/utils";
import { v2FocusRing } from "./shared";

export type StepStatus = "completed" | "active" | "pending";

export type StepperStep = {
  label: ReactNode;
  caption?: ReactNode;
  status: StepStatus;
  onClick?: () => void;
};

export type StepperProps = {
  steps: readonly StepperStep[];
  className?: string;
};

const statusClasses: Record<StepStatus, string> = {
  completed: "text-[color:var(--v2-ink)]",
  active: "text-[color:var(--v2-ink)]",
  pending: "text-[color:var(--v2-ink3)]",
};

export function Stepper({ steps, className }: StepperProps) {
  return (
    <ol className={cn("flex w-full items-start gap-2", className)}>
      {steps.map((step, index) => (
        <li
          className="flex min-w-0 flex-1 items-start gap-2"
          key={`${index}-${String(step.label)}`}
        >
          {index > 0 ? (
            <span
              aria-hidden="true"
              className={cn(
                "mt-[11px] h-px min-w-3 flex-1",
                steps[index - 1]?.status === "completed"
                  ? "bg-[var(--v2-brand)]"
                  : "bg-[var(--v2-line)]",
              )}
            />
          ) : null}
          <div
            className={cn(
              "flex min-w-0 items-start gap-2 text-[13.5px] font-medium",
              statusClasses[step.status],
            )}
            data-v2-step-state={step.status}
          >
            {step.onClick ? (
              <button
                className={cn("flex min-w-0 items-start gap-2 text-left", v2FocusRing)}
                onClick={step.onClick}
                type="button"
              >
                <StepNode status={step.status} />
                <StepText label={step.label} caption={step.caption} />
              </button>
            ) : (
              <>
                <StepNode status={step.status} />
                <StepText label={step.label} caption={step.caption} />
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StepNode({ status }: { status: StepStatus }) {
  return (
    <span
      className={cn(
        "grid h-[23px] w-[23px] shrink-0 place-items-center rounded-full text-[11.5px] font-semibold",
        status === "pending"
          ? "bg-[var(--v2-line)] text-[color:var(--v2-ink2)]"
          : "bg-[var(--v2-brand)] text-[color:var(--v2-paper)]",
      )}
    >
      {status === "completed" ? (
        <V2Icon name="check" size={13} strokeWidth={2.4} />
      ) : status === "active" ? (
        "•"
      ) : (
        ""
      )}
    </span>
  );
}

function StepText({ label, caption }: { label: ReactNode; caption?: ReactNode }) {
  return (
    <span className="min-w-0">
      <span className="block truncate">{label}</span>
      {caption ? (
        <span className="mt-0.5 block truncate text-[11.5px] font-medium text-[color:var(--v2-ink3)]">
          {caption}
        </span>
      ) : null}
    </span>
  );
}
