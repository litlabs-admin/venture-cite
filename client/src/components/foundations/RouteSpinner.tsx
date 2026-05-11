import { cn } from "@/lib/utils";

export function RouteSpinner({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className="flex items-center justify-center w-full h-full min-h-[40vh]"
      role="status"
      aria-label={label}
    >
      <div
        className={cn(
          "h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin",
          className,
        )}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
