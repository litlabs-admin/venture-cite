import { cn } from "@/lib/utils";

export type AvatarProps = {
  initials: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-[11px]",
  lg: "h-10 w-10 text-[13px]",
} as const;

export function Avatar({ initials, label, size = "md", className }: AvatarProps) {
  return (
    <span
      aria-label={label}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full bg-[var(--v2-brand)] font-semibold text-[color:var(--v2-paper)]",
        sizeClasses[size],
        className,
      )}
      role={label ? "img" : undefined}
    >
      {initials}
    </span>
  );
}
