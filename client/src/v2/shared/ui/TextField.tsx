import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { v2ControlClasses } from "./shared";

export type TextFieldProps = Omit<ComponentPropsWithoutRef<typeof Input>, "id"> & {
  label: ReactNode;
  id?: string;
  helper?: ReactNode;
  error?: ReactNode;
  className?: string;
};

export function TextField({ label, id, helper, error, className, ...props }: TextFieldProps) {
  const inputId =
    id ??
    `v2-field-${typeof label === "string" ? label.toLowerCase().replace(/\s+/g, "-") : "input"}`;
  return (
    <div className="w-full">
      <label
        className="mb-1.5 block text-[12px] leading-[1.35] font-semibold text-[color:var(--v2-ink2)]"
        htmlFor={inputId}
      >
        {label}
      </label>
      <Input
        {...props}
        aria-invalid={error ? true : undefined}
        className={cn(
          v2ControlClasses,
          "h-9 text-[13px] placeholder:text-[color:var(--v2-ink4)]",
          error && "border-[var(--v2-bad)]",
          className,
        )}
        id={inputId}
      />
      {error ? (
        <p className="mt-1.5 text-[12px] text-[color:var(--v2-bad)]">{error}</p>
      ) : helper ? (
        <p className="mt-1.5 text-[12px] text-[color:var(--v2-ink3)]">{helper}</p>
      ) : null}
    </div>
  );
}
