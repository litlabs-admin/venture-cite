import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { v2FocusRing } from "./shared";

export type CheckboxRowProps = {
  label: ReactNode;
  description?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export function CheckboxRow({
  label,
  description,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  className,
}: CheckboxRowProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[var(--v2-radius)] border border-transparent p-2",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <Checkbox
        checked={checked}
        className={cn(
          "mt-0.5 h-4 w-4 border-[var(--v2-line2)] bg-[var(--v2-paper)] data-[state=checked]:border-[var(--v2-brand)] data-[state=checked]:bg-[var(--v2-brand)] data-[state=checked]:text-[color:var(--v2-paper)]",
          v2FocusRing,
        )}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange?.(value === true)}
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-[color:var(--v2-ink)]">{label}</span>
        {description ? (
          <span className="mt-1 block text-[12px] text-[color:var(--v2-ink3)]">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
