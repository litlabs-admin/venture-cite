import { ChartAxis } from "./ChartAxis";
import { getXPosition, getYPosition, type ChartPlot } from "./chartGeometry";

const SERIES_COLORS = [
  "var(--v2-series-1)",
  "var(--v2-series-2)",
  "var(--v2-series-3)",
  "var(--v2-series-4)",
  "var(--v2-series-5)",
  "var(--v2-series-6)",
] as const;

export type BarCompareSeries = { id: string; label: string };

export type BarCompareGroup = {
  id: string;
  label: string;
  values: Readonly<Record<string, number>>;
};

export type BarCompareChartProps = {
  groups: readonly BarCompareGroup[];
  series: readonly [BarCompareSeries, BarCompareSeries, ...BarCompareSeries[]];
  yTicks: readonly number[];
  height: number;
  showValues: boolean;
  ariaLabel: string;
};

function colorForSeries(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

function maximumGroupValue(
  groups: readonly BarCompareGroup[],
  series: readonly BarCompareSeries[],
): number {
  return groups.reduce(
    (maximum, group) =>
      series.reduce(
        (groupMaximum, item) => Math.max(groupMaximum, group.values[item.id] ?? 0),
        maximum,
      ),
    0,
  );
}

export function BarCompareChart({
  groups,
  series,
  yTicks,
  height,
  showValues,
  ariaLabel,
}: BarCompareChartProps) {
  const width = 640;
  const viewBoxHeight = 220;
  const maximum = maximumGroupValue(groups, series);
  const yMin = yTicks.length > 0 ? Math.min(...yTicks) : 0;
  const yMax = yTicks.length > 0 ? Math.max(...yTicks) : Math.max(1, maximum);
  const yDomain: readonly [number, number] = [yMin, yMax];
  const plot: ChartPlot = { top: 12, right: 620, bottom: 174, left: 42 };
  const groupWidth = groups.length > 0 ? (plot.right - plot.left) / groups.length : 0;
  const groupPositions = groups.map((_, index) => getXPosition(index, groups.length, plot));
  const barGap = 4;
  const barWidth = Math.min(
    28,
    Math.max(8, (groupWidth - 12 - barGap * (series.length - 1)) / series.length),
  );
  const zeroY = getYPosition(0, yDomain, plot);

  return (
    <div className="w-full" data-chart="bar-compare">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${viewBoxHeight}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
      >
        <ChartAxis
          width={width}
          height={viewBoxHeight}
          plot={plot}
          yDomain={yDomain}
          yTicks={yTicks}
          xLabels={groups.map((group) => group.label)}
          xPositions={groupPositions}
        />
        {groups.map((group, groupIndex) => {
          const groupCenter = groupPositions[groupIndex] ?? plot.left;
          const groupBarsWidth = series.length * barWidth + (series.length - 1) * barGap;
          return series.map((item, seriesIndex) => {
            const value = group.values[item.id];
            if (value === undefined) return null;

            const x = groupCenter - groupBarsWidth / 2 + seriesIndex * (barWidth + barGap);
            const valueY = getYPosition(value, yDomain, plot);
            const barY = Math.min(valueY, zeroY);
            const barHeight = Math.abs(zeroY - valueY);
            return (
              <g key={`${group.id}-${item.id}`} data-group-id={group.id} data-series-id={item.id}>
                <rect
                  data-testid="bar-series-bar"
                  data-chart-element="bar-series-bar"
                  data-group-id={group.id}
                  data-series-id={item.id}
                  x={x}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  rx="2"
                  fill={colorForSeries(seriesIndex)}
                />
                {showValues && (
                  <text
                    data-testid="bar-value"
                    data-chart-element="bar-value"
                    data-group-id={group.id}
                    data-series-id={item.id}
                    x={x + barWidth / 2}
                    y={Math.max(plot.top + 10, barY - 6)}
                    textAnchor="middle"
                    className="font-mono tabular-nums"
                    fontSize="10"
                    fontWeight="600"
                    fill="var(--v2-ink3)"
                  >
                    {value}
                  </text>
                )}
              </g>
            );
          });
        })}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1" aria-hidden="true">
        {series.map((item, index) => (
          <span
            key={item.id}
            className="inline-flex items-center gap-1.5 text-xs"
            style={{ color: "var(--v2-ink3)" }}
          >
            <span style={{ width: 8, height: 8, backgroundColor: colorForSeries(index) }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
