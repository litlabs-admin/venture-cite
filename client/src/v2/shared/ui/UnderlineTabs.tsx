import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { v2FocusRing } from "./shared";

export type UnderlineTab = {
  value: string;
  label: ReactNode;
  count?: ReactNode;
  disabled?: boolean;
};

export type UnderlineTabsProps = {
  items: readonly UnderlineTab[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
};

export function UnderlineTabs({
  items,
  value,
  defaultValue,
  onChange,
  className,
}: UnderlineTabsProps) {
  return (
    <Tabs
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={onChange}
      className={className}
    >
      <TabsList className="h-auto w-full justify-start gap-5 rounded-none border-0 border-b border-[var(--v2-line)] bg-transparent p-0">
        {items.map((item) => (
          <TabsTrigger
            className={cn(
              "rounded-none border-b-2 border-transparent bg-transparent px-0 pb-2.5 pt-0 text-[13.5px] font-medium text-[color:var(--v2-ink3)] shadow-none",
              "hover:bg-transparent hover:text-[color:var(--v2-ink)] data-[state=active]:border-[var(--v2-brand)] data-[state=active]:bg-transparent data-[state=active]:text-[color:var(--v2-brand)]",
              v2FocusRing,
            )}
            disabled={item.disabled}
            key={item.value}
            value={item.value}
          >
            <span>{item.label}</span>
            {item.count !== undefined ? (
              <span className="ml-1 text-[color:var(--v2-ink4)]">{item.count}</span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
