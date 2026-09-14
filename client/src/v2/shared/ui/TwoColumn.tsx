import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TwoColumnProps = {
  main: ReactNode;
  rightRail: ReactNode;
  rightRailWidth?: 200 | 322 | 390;
  className?: string;
  mainClassName?: string;
  rightRailClassName?: string;
};

const railClasses: Record<NonNullable<TwoColumnProps["rightRailWidth"]>, string> = {
  200: "md:grid-cols-[minmax(0,1fr)_200px]",
  322: "md:grid-cols-[minmax(0,1fr)_322px]",
  390: "md:grid-cols-[minmax(0,1fr)_390px]",
};

export function TwoColumn({
  main,
  rightRail,
  rightRailWidth = 322,
  className,
  mainClassName,
  rightRailClassName,
}: TwoColumnProps) {
  return (
    <div className={cn("grid min-w-0 grid-cols-1 gap-6", railClasses[rightRailWidth], className)}>
      <main className={cn("min-w-0", mainClassName)}>{main}</main>
      <aside className={cn("min-w-0", rightRailClassName)}>{rightRail}</aside>
    </div>
  );
}
