// Small inline-SVG sparkline. Reused at table-row size (48x14, matching the
// reference's own measured dimensions) and, larger, on the prompt detail
// page's trend chart backdrop.
export function SparklineCell({
  values,
  width = 48,
  height = 14,
}: {
  /** Real score series, oldest first. Renders nothing (not a flat fabricated
   *  line) when there are fewer than 2 points - one point has no trend. */
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return <span className="inline-block" style={{ width, height }} aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });
  const path = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const up = values[values.length - 1] >= values[0];

  return (
    <svg width={width} height={height} className="flex-shrink-0" aria-hidden>
      <path
        d={path}
        fill="none"
        stroke={up ? "var(--positive, var(--brand-accent))" : "var(--negative)"}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
