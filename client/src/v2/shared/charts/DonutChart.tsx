const SERIES_COLORS = [
  "var(--v2-series-1)",
  "var(--v2-series-2)",
  "var(--v2-series-3)",
  "var(--v2-series-4)",
  "var(--v2-series-5)",
  "var(--v2-series-6)",
] as const;

export type DonutSegment = { id: string; label: string; value: number };

export type DonutChartProps = {
  segments: readonly DonutSegment[];
  centreValue: string | number;
  centreCaption: string;
  size: number;
  thickness: number;
  legend?: boolean;
};

function colorForSegment(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

function accessibleSummary(segments: readonly DonutSegment[]): string {
  return segments.map((segment) => `${segment.value} ${segment.label}`).join(", ");
}

export function DonutChart({
  segments,
  centreValue,
  centreCaption,
  size,
  thickness,
  legend = false,
}: DonutChartProps) {
  const centre = size / 2;
  const radius = Math.max(1, (size - thickness) / 2);
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  let offset = 0;

  const segmentElements = segments.map((segment, index) => {
    const value = Math.max(0, segment.value);
    const segmentLength = total > 0 ? (circumference * value) / total : 0;
    const element = (
      <circle
        key={segment.id}
        data-testid="donut-segment"
        data-chart-element="donut-segment"
        data-segment-id={segment.id}
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke={colorForSegment(index)}
        strokeWidth={thickness}
        strokeLinecap="butt"
        strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${centre} ${centre})`}
      />
    );
    offset += segmentLength;
    return element;
  });

  const label = `Donut chart: ${accessibleSummary(segments)}`;

  return (
    <div className="inline-flex flex-col gap-3" data-chart="donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle
          data-chart-element="donut-track"
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke="var(--v2-line)"
          strokeWidth={thickness}
        />
        {segmentElements}
        <text
          x={centre}
          y={centre - 2}
          textAnchor="middle"
          className="font-sans tabular-nums"
          fontSize={size * 0.18}
          fontWeight="700"
          fill="var(--v2-brand)"
        >
          {centreValue}
        </text>
        <text
          x={centre}
          y={centre + size * 0.14}
          textAnchor="middle"
          className="font-sans"
          fontSize={size * 0.094}
          fill="var(--v2-ink3)"
        >
          {centreCaption}
        </text>
      </svg>
      {legend && (
        <div className="flex flex-col gap-1" aria-hidden="true">
          {segments.map((segment, index) => {
            const percentage =
              total > 0 ? Math.round((Math.max(0, segment.value) / total) * 100) : 0;
            return (
              <div
                key={segment.id}
                className="flex items-center gap-2 text-xs"
                style={{ color: "var(--v2-ink3)" }}
              >
                <span style={{ width: 8, height: 8, backgroundColor: colorForSegment(index) }} />
                <span>{segment.label}</span>
                <span className="ml-auto font-mono tabular-nums">{percentage}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
