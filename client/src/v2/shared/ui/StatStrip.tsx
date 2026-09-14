import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StatTile, type StatTileProps } from "./StatTile";

export type StatStripItem = Omit<StatTileProps, "className"> & { key?: string };

export type StatStripProps = {
  items: readonly StatStripItem[];
  footer?: ReactNode;
  className?: string;
};

export function StatStrip({ items, footer, className }: StatStripProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-stretch divide-x divide-[var(--v2-line)] border-y border-[var(--v2-line)] py-4",
        className,
      )}
    >
      {items.map((item, index) => (
        <div
          className="min-w-[140px] flex-1 px-5 first:pl-0 last:pr-0"
          key={item.key ?? `${index}-${String(item.label)}`}
        >
          <StatTile {...item} />
        </div>
      ))}
      {footer ? (
        <div className="basis-full pt-3 text-[12.5px] text-[color:var(--v2-ink3)]">{footer}</div>
      ) : null}
    </div>
  );
}
