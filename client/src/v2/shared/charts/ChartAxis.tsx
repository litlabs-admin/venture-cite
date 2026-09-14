import { getXPosition, getYPosition, type ChartPlot } from "./chartGeometry";

export type { ChartPlot } from "./chartGeometry";

export type ChartAxisProps = {
  width: number;
  height: number;
  plot: ChartPlot;
  yDomain: readonly [number, number];
  yTicks: readonly number[];
  xLabels?: readonly string[];
  xPositions?: readonly number[];
};

function formatTick(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function ChartAxis({
  width,
  height,
  plot,
  yDomain,
  yTicks,
  xLabels = [],
  xPositions,
}: ChartAxisProps) {
  const axisRight = Math.min(width, plot.right);

  return (
    <g data-chart-element="chart-axis" aria-hidden="true">
      {yTicks.map((tick) => {
        const y = getYPosition(tick, yDomain, plot);
        return (
          <g key={`y-${tick}`}>
            <line
              x1={plot.left}
              y1={y}
              x2={axisRight}
              y2={y}
              stroke="var(--v2-line)"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <text
              x={plot.left - 8}
              y={y + 3.5}
              textAnchor="end"
              className="font-mono tabular-nums"
              fontSize="10"
              fill="var(--v2-ink3)"
            >
              {formatTick(tick)}
            </text>
          </g>
        );
      })}
      <line
        x1={plot.left}
        y1={plot.bottom}
        x2={axisRight}
        y2={plot.bottom}
        stroke="var(--v2-line)"
        strokeWidth="1"
      />
      {xLabels.map((label, index) => {
        const x = xPositions?.[index] ?? getXPosition(index, xLabels.length, plot);
        const anchor = index === 0 ? "start" : index === xLabels.length - 1 ? "end" : "middle";
        return (
          <text
            key={`${label}-${index}`}
            data-chart-element="axis-x-label"
            x={x}
            y={Math.min(height - 2, plot.bottom + 20)}
            textAnchor={anchor}
            className="font-mono tabular-nums"
            fontSize="10.5"
            fill="var(--v2-ink3)"
          >
            {label}
          </text>
        );
      })}
    </g>
  );
}
