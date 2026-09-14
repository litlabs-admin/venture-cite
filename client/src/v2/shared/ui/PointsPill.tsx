import { V2Icon } from "@/v2/theme/V2Icon";
import { cn } from "@/lib/utils";

export type PointsPillProps = {
  points: number;
  className?: string;
};

export function PointsPill({ points, className }: PointsPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-[var(--v2-brand-soft)] px-2 py-[3px] text-[11.5px] font-semibold text-[color:var(--v2-brand)] tabular-nums",
        className,
      )}
    >
      <V2Icon name="star" size={13} />
      {points} work points
    </span>
  );
}
