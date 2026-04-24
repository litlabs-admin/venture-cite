interface VisibilityGaugeProps {
  score: number;
  size?: number;
  trackColor?: string;
  fillColor?: string;
}

export default function VisibilityGauge({
  score,
  size = 160,
  trackColor,
  fillColor,
}: VisibilityGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const resolvedFill =
    fillColor ??
    (clamped >= 70
      ? "hsl(var(--chart-2, 142 71% 45%))"
      : clamped >= 40
        ? "hsl(var(--chart-4, 48 96% 53%))"
        : "hsl(var(--destructive, 0 84% 60%))");
  const resolvedTrack = trackColor ?? "hsl(var(--muted, 240 5% 26%))";

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={resolvedTrack}
          strokeWidth={12}
          opacity={0.25}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={resolvedFill}
          strokeWidth={12}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-4xl font-bold text-foreground leading-none">{clamped}</div>
        <div className="text-xs text-muted-foreground mt-1">/ 100</div>
      </div>
    </div>
  );
}
