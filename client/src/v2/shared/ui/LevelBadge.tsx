import { V2Icon } from "@/v2/theme/V2Icon";
import { cn } from "@/lib/utils";

export type LevelBadgeProps = {
  level: number;
  name: string;
  size?: "sm" | "md" | "lg";
  completed?: boolean;
  className?: string;
};

const sizeClasses = {
  sm: "h-10 w-10 text-[12px]",
  md: "h-[52px] w-[52px] text-[14px]",
  lg: "h-16 w-16 text-[17px]",
} as const;

export function LevelBadge({
  level,
  name,
  size = "md",
  completed = true,
  className,
}: LevelBadgeProps) {
  return (
    <div className={cn("inline-flex flex-col items-center gap-1.5", className)}>
      <div
        className={cn(
          "grid place-items-center bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)] [clip-path:polygon(50%_0%,92%_25%,92%_75%,50%_100%,8%_75%,8%_25%)]",
          sizeClasses[size],
          !completed && "bg-[var(--v2-inset)] text-[color:var(--v2-ink3)]",
        )}
        data-level={level}
      >
        <span className="relative grid place-items-center">
          <V2Icon name="star" size={size === "lg" ? 19 : 15} />
          <span className="absolute text-[9px] font-semibold">{level}</span>
        </span>
      </div>
      <span className="max-w-24 truncate text-center text-[12px] font-semibold text-[color:var(--v2-ink2)]">
        {name}
      </span>
    </div>
  );
}
