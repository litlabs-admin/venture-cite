import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { v2FocusRing } from "./shared";

export type RadioCardProps = {
  name: string;
  value: string;
  label: ReactNode;
  description?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

export function RadioCard({
  name,
  value,
  label,
  description,
  checked,
  defaultChecked,
  onChange,
  disabled,
  className,
}: RadioCardProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[var(--v2-radius)] border border-[var(--v2-line)] bg-[var(--v2-paper)] p-4",
        "has-[:checked]:border-[var(--v2-brand)] has-[:checked]:bg-[var(--v2-brand-soft)]",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input
        checked={checked}
        className={cn("mt-0.5 h-4 w-4 accent-[var(--v2-brand)]", v2FocusRing)}
        defaultChecked={defaultChecked}
        disabled={disabled}
        name={name}
        onChange={() => onChange?.(value)}
        type="radio"
        value={value}
      />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-[color:var(--v2-ink)]">
          {label}
        </span>
        {description ? (
          <span className="mt-1 block text-[12.5px] leading-[1.45] text-[color:var(--v2-ink3)]">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
