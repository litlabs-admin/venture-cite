import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { v2FocusRing } from "./shared";

export type SegmentedItem = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

export type SegmentedProps = {
  items: readonly SegmentedItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  kind?: "range" | "mode";
  className?: string;
};

export function Segmented({
  items,
  value,
  defaultValue,
  onChange,
  kind = "range",
  className,
}: SegmentedProps) {
  return (
    <Tabs
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={onChange}
      className={className}
    >
      <TabsList className="inline-flex h-auto gap-1 rounded-[var(--v2-radius)] border border-[var(--v2-line)] bg-[var(--v2-paper)] p-[3px]">
        {items.map((item) => (
          <TabsTrigger
            className={cn(
              "rounded-[5px] px-2.5 py-1.5 text-[12.5px] font-medium text-[color:var(--v2-ink3)] shadow-none",
              "hover:bg-[var(--v2-inset)] hover:text-[color:var(--v2-ink)]",
              kind === "mode"
                ? "data-[state=active]:bg-[var(--v2-brand)] data-[state=active]:text-[color:var(--v2-paper)]"
                : "data-[state=active]:bg-[var(--v2-brand-soft)] data-[state=active]:text-[color:var(--v2-brand)]",
              v2FocusRing,
            )}
            disabled={item.disabled}
            key={item.value}
            value={item.value}
          >
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
