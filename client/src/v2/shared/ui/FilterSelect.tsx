import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { v2ControlClasses } from "./shared";

export type FilterOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export type FilterSelectProps = {
  options: readonly FilterOption[];
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  label?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

export function FilterSelect({
  options,
  value,
  defaultValue,
  placeholder,
  label = "Filter",
  onValueChange,
  disabled,
  className,
}: FilterSelectProps) {
  return (
    <Select
      defaultValue={defaultValue}
      disabled={disabled}
      onValueChange={onValueChange}
      value={value}
    >
      <SelectTrigger
        aria-label={label}
        className={cn(v2ControlClasses, "h-9 min-w-28 px-3 text-[13px]", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="border-[var(--v2-line)] bg-[var(--v2-paper)] text-[color:var(--v2-ink)] shadow-none">
        {options.map((option) => (
          <SelectItem
            className="text-[13px] focus:bg-[var(--v2-inset)] focus:text-[color:var(--v2-ink)]"
            disabled={option.disabled}
            key={option.value}
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
