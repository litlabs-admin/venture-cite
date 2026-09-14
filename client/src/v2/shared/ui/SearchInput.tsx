import type { ComponentPropsWithoutRef } from "react";
import { Input } from "@/components/ui/input";
import { V2Icon } from "@/v2/theme/V2Icon";
import { cn } from "@/lib/utils";
import { v2ControlClasses } from "./shared";

export type SearchInputProps = Omit<ComponentPropsWithoutRef<typeof Input>, "type"> & {
  className?: string;
};

export function SearchInput({ className, ...props }: SearchInputProps) {
  return (
    <div className="relative">
      <V2Icon
        name="srch"
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--v2-ink3)]"
      />
      <Input
        {...props}
        className={cn(
          v2ControlClasses,
          "h-9 pl-9 pr-3 text-[13px] placeholder:text-[color:var(--v2-ink4)]",
          className,
        )}
        type="search"
      />
    </div>
  );
}
