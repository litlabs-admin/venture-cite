import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type KeyValueItem = {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
};

export type KeyValueListProps = {
  items: readonly KeyValueItem[];
  className?: string;
};

export function KeyValueList({ items, className }: KeyValueListProps) {
  return (
    <dl className={cn("divide-y divide-[var(--v2-line)]", className)}>
      {items.map((item, index) => (
        <div
          className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-4 py-3 first:pt-0 last:pb-0"
          key={`${index}-${String(item.label)}`}
        >
          <dt className="text-[12.5px] leading-[1.4] text-[color:var(--v2-ink3)]">{item.label}</dt>
          <dd className="min-w-0 text-[13px] leading-[1.45] text-[color:var(--v2-ink)]">
            <div>{item.value}</div>
            {item.detail ? (
              <div className="mt-1 text-[12px] text-[color:var(--v2-ink3)]">{item.detail}</div>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
