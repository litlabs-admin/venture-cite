import { useId } from "react";
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

export type TrendPoint = { x: string; y: number | null };

export type TrendSeries = {
  id: string;
  label: string;
  points: readonly TrendPoint[];
  style: "solid" | "dashed" | "dotted";
  area?: boolean;
};

export type TrendChartProps = {
  series: readonly TrendSeries[];
  yDomain: readonly [number, number];
  yTicks: readonly number[];
  xLabels: readonly string[];
  height: number;
  endpointBadge?: { seriesId: string; text: string };
  legend?: boolean;
  ariaLabel: string;
};

type PositionedPoint = { x: number; y: number };

function colorForSeries(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

function dashForStyle(style: TrendSeries["style"]): string | undefined {
  switch (style) {
    case "solid":
      return undefined;
    case "dashed":
      return "5 4";
    case "dotted":
      return "1 4";
    default: {
      const exhaustive: never = style;
      return exhaustive;
    }
  }
}

function splitDefinedPoints(
  points: readonly TrendPoint[],
  yDomain: readonly [number, number],
  plot: ChartPlot,
): PositionedPoint[][] {
  const segments: PositionedPoint[][] = [];
  let current: PositionedPoint[] = [];

  points.forEach((point, index) => {
    if (point.y === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }

    current.push({
      x: getXPosition(index, points.length, plot),
      y: getYPosition(point.y, yDomain, plot),
    });
  });

  if (current.length > 0) segments.push(current);
  return segments;
}

function linePath(points: readonly PositionedPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function areaPath(points: readonly PositionedPoint[], baseline: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L ${last.x.toFixed(2)} ${baseline.toFixed(2)} L ${first.x.toFixed(2)} ${baseline.toFixed(2)} Z`;
}

function endpointForSeries(
  selectedSeries: TrendSeries | undefined,
  yDomain: readonly [number, number],
  plot: ChartPlot,
): PositionedPoint | undefined {
  if (!selectedSeries) return undefined;
  const segments = splitDefinedPoints(selectedSeries.points, yDomain, plot);
  return segments[segments.length - 1]?.at(-1);
}

export function TrendChart({
  series,
  yDomain,
  yTicks,
  xLabels,
  height,
  endpointBadge,
  legend = false,
  ariaLabel,
}: TrendChartProps) {
  const gradientId = `trend-gradient-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const width = 640;
  const viewBoxHeight = 180;
  const plot: ChartPlot = {
    top: legend ? 26 : 12,
    right: endpointBadge ? 592 : 620,
    bottom: xLabels.length > 0 ? 148 : 164,
    left: 42,
  };
  const selectedSeries = endpointBadge
    ? series.find((item) => item.id === endpointBadge.seriesId)
    : undefined;
  const endpoint = endpointForSeries(selectedSeries, yDomain, plot);
  const badgeWidth = endpointBadge ? Math.max(28, endpointBadge.text.length * 7 + 10) : 0;
  const badgeX = endpoint ? Math.min(plot.right - badgeWidth, endpoint.x - badgeWidth / 2) : 0;
  const badgeY = endpoint ? Math.max(plot.top, endpoint.y - 28) : 0;
  const xPositions = xLabels.map((_, index) => getXPosition(index, xLabels.length, plot));

  return (
    <div className="w-full" data-chart="trend">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${viewBoxHeight}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
      >
        {series.some((item) => item.area) && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--v2-brand-soft)" stopOpacity="0.72" />
              <stop offset="100%" stopColor="var(--v2-brand-soft)" stopOpacity="0.12" />
            </linearGradient>
          </defs>
        )}
        <ChartAxis
          width={width}
          height={viewBoxHeight}
          plot={plot}
          yDomain={yDomain}
          yTicks={yTicks}
          xLabels={xLabels}
          xPositions={xPositions}
        />
        {series.map((item, seriesIndex) => {
          const color = colorForSeries(seriesIndex);
          const segments = splitDefinedPoints(item.points, yDomain, plot);
          const dasharray = dashForStyle(item.style);
          return (
            <g key={item.id} data-series-id={item.id}>
              {item.area &&
                segments.map((segment, segmentIndex) => (
                  <path
                    key={`${item.id}-area-${segmentIndex}`}
                    data-testid="trend-series-area"
                    data-chart-element="trend-series-area"
                    data-series-id={item.id}
                    d={areaPath(segment, plot.bottom)}
                    fill={`url(#${gradientId})`}
                    stroke="none"
                  />
                ))}
              {segments.map((segment, segmentIndex) => (
                <path
                  key={`${item.id}-line-${segmentIndex}`}
                  data-testid="trend-series-line"
                  data-chart-element="trend-series-line"
                  data-series-id={item.id}
                  data-point-count={segment.length}
                  d={linePath(segment)}
                  fill="none"
                  stroke={color}
                  strokeWidth={item.style === "solid" ? 2.2 : 1.8}
                  strokeDasharray={dasharray}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {item.style === "solid" &&
                item.points.map((point, pointIndex) => {
                  if (point.y === null) return null;
                  const pointX = getXPosition(pointIndex, item.points.length, plot);
                  const pointY = getYPosition(point.y, yDomain, plot);
                  const isEndpoint =
                    endpointBadge?.seriesId === item.id &&
                    endpoint?.x === pointX &&
                    endpoint?.y === pointY;
                  return (
                    <circle
                      key={`${item.id}-marker-${pointIndex}`}
                      data-chart-element="trend-series-marker"
                      data-series-id={item.id}
                      cx={pointX}
                      cy={pointY}
                      r={isEndpoint ? 3.8 : 2.2}
                      fill="var(--v2-brand-soft)"
                      stroke={color}
                      strokeWidth="1.4"
                    />
                  );
                })}
            </g>
          );
        })}
        {endpointBadge && endpoint && (
          <g data-chart-element="trend-endpoint-badge">
            <circle
              cx={endpoint.x}
              cy={endpoint.y}
              r="4.2"
              fill="var(--v2-brand)"
              stroke="var(--v2-brand-soft)"
              strokeWidth="2"
            />
            <rect
              x={badgeX}
              y={badgeY}
              width={badgeWidth}
              height="20"
              rx="6"
              fill="var(--v2-brand)"
            />
            <text
              x={badgeX + badgeWidth / 2}
              y={badgeY + 13.8}
              textAnchor="middle"
              className="font-mono tabular-nums"
              fontSize="11"
              fontWeight="700"
              fill="var(--v2-brand-soft)"
            >
              {endpointBadge.text}
            </text>
          </g>
        )}
      </svg>
      {legend && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-hidden="true">
          {series.map((item, index) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1.5 text-xs"
              style={{ color: "var(--v2-ink3)" }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 18,
                  borderTopWidth: 2,
                  borderTopStyle:
                    item.style === "solid"
                      ? "solid"
                      : item.style === "dashed"
                        ? "dashed"
                        : "dotted",
                  borderTopColor: colorForSeries(index),
                }}
              />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
