export type ChartPlot = Readonly<{
  top: number;
  right: number;
  bottom: number;
  left: number;
}>;

export function getXPosition(index: number, count: number, plot: ChartPlot): number {
  if (count <= 1) return plot.left + (plot.right - plot.left) / 2;
  return plot.left + ((plot.right - plot.left) * index) / (count - 1);
}

export function getYPosition(
  value: number,
  yDomain: readonly [number, number],
  plot: ChartPlot,
): number {
  const [domainMin, domainMax] = yDomain;
  if (domainMin === domainMax) return plot.top + (plot.bottom - plot.top) / 2;

  const clamped = Math.min(domainMax, Math.max(domainMin, value));
  const proportion = (clamped - domainMin) / (domainMax - domainMin);
  return plot.bottom - proportion * (plot.bottom - plot.top);
}
