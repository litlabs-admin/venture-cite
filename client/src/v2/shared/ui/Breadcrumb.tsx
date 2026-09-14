import type { ReactNode } from "react";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2FocusRing } from "./shared";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: ReactNode;
  href?: string;
  current?: boolean;
};

export type BreadcrumbProps = {
  items: readonly BreadcrumbItem[];
  className?: string;
};

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex min-w-0 items-center gap-2", className)}>
      <ol className="flex min-w-0 items-center gap-2">
        {items.map((item, index) => (
          <li className="flex min-w-0 items-center gap-2" key={`${index}-${String(item.label)}`}>
            {index > 0 ? (
              <V2Icon name="chev" size={12} className="shrink-0 text-[color:var(--v2-ink4)]" />
            ) : null}
            {item.href && !item.current ? (
              <a
                className={cn(
                  "truncate text-[13.5px] font-medium text-[color:var(--v2-ink3)] hover:text-[color:var(--v2-brand)]",
                  v2FocusRing,
                )}
                href={item.href}
              >
                {item.label}
              </a>
            ) : (
              <span
                className={cn(
                  "truncate text-[13.5px]",
                  item.current
                    ? "font-semibold text-[color:var(--v2-ink)]"
                    : "text-[color:var(--v2-ink3)]",
                )}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
