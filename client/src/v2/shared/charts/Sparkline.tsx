const TREND_COLORS = {
  up: "var(--v2-series-1)",
  down: "var(--v2-series-2)",
  flat: "var(--v2-series-3)",
} as const;

export type SparklineProps = {
  points: readonly (number | null)[];
  width: number;
  height: number;
  trend: "up" | "down" | "flat";
  delta?: string;
  ariaLabel?: string;
};

type SparkPoint = { x: number; y: number };

function splitPoints(
  points: readonly (number | null)[],
  width: number,
  height: number,
): SparkPoint[][] {
  const padding = 2;
  const values = points.filter((point): point is number => point !== null);
  const minimum = values.length > 0 ? Math.min(...values) : 0;
  const maximum = values.length > 0 ? Math.max(...values) : 1;
  const segments: SparkPoint[][] = [];
  let current: SparkPoint[] = [];

  points.forEach((point, index) => {
    if (point === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }

    const x =
      points.length <= 1
        ? width / 2
        : padding + ((width - padding * 2) * index) / (points.length - 1);
    const y =
      minimum === maximum
        ? height / 2
        : height - padding - ((point - minimum) / (maximum - minimum)) * (height - padding * 2);
    current.push({ x, y });
  });

  if (current.length > 0) segments.push(current);
  return segments;
}

function linePath(points: readonly SparkPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

export function Sparkline({ points, width, height, trend, delta, ariaLabel }: SparklineProps) {
  const label =
    ariaLabel ??
    `Sparkline with ${points.length} points, trending ${trend}${delta ? `, ${delta}` : ""}`;
  const segments = splitPoints(points, width, height);

  return (
    <div className="inline-flex items-center gap-2" data-chart="sparkline" data-trend={trend}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
      >
        {segments.map((segment, index) => (
          <path
            key={`spark-${index}`}
            data-testid="sparkline-line"
            data-chart-element="sparkline-line"
            data-point-count={segment.length}
            d={linePath(segment)}
            fill="none"
            stroke={TREND_COLORS[trend]}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      {delta && (
        <span className="font-mono tabular-nums text-xs" style={{ color: TREND_COLORS[trend] }}>
          {delta}
        </span>
      )}
    </div>
  );
}
