// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BarCompareChart } from "@/v2/shared/charts/BarCompareChart";
import { DonutChart } from "@/v2/shared/charts/DonutChart";
import { Sparkline } from "@/v2/shared/charts/Sparkline";
import { TrendChart } from "@/v2/shared/charts/TrendChart";
import { UsageMeter } from "@/v2/shared/charts/UsageMeter";

describe("V2 shared charts", () => {
  it("renders trend series and preserves a null-point gap", () => {
    render(
      <TrendChart
        series={[
          {
            id: "visibility",
            label: "Observed visibility",
            points: [
              { x: "Aug 26", y: 34 },
              { x: "Aug 29", y: 46 },
              { x: "Sep 1", y: null },
              { x: "Sep 5", y: 64 },
            ],
            style: "solid",
            area: true,
          },
          {
            id: "baseline",
            label: "Baseline",
            points: [
              { x: "Aug 26", y: 28 },
              { x: "Aug 29", y: 31 },
              { x: "Sep 1", y: 34 },
              { x: "Sep 5", y: 38 },
            ],
            style: "dashed",
          },
        ]}
        yDomain={[0, 100]}
        yTicks={[0, 25, 50, 75, 100]}
        xLabels={["Aug 26", "Aug 29", "Sep 1", "Sep 5"]}
        height={180}
        endpointBadge={{ seriesId: "visibility", text: "64" }}
        legend
        ariaLabel="Observed visibility over the measurement period"
      />,
    );

    expect(
      screen.getByRole("img", { name: "Observed visibility over the measurement period" }),
    ).toBeTruthy();
    const visibilityLines = screen
      .getAllByTestId("trend-series-line")
      .filter((path) => path.getAttribute("data-series-id") === "visibility");
    expect(visibilityLines).toHaveLength(2);
    expect(visibilityLines[0].getAttribute("d")).toContain("L");
    expect(visibilityLines[1].getAttribute("d")).not.toContain("L");
    expect(screen.getAllByTestId("trend-series-line")).toHaveLength(3);
    expect(screen.getAllByTestId("trend-series-area")).toHaveLength(2);
  });

  it("generates a distinct area gradient for each trend chart", () => {
    render(
      <div>
        <TrendChart
          series={[
            {
              id: "first",
              label: "First",
              points: [
                { x: "A", y: 18 },
                { x: "B", y: 24 },
              ],
              style: "solid",
              area: true,
            },
          ]}
          yDomain={[0, 40]}
          yTicks={[0, 20, 40]}
          xLabels={["A", "B"]}
          height={120}
          ariaLabel="First trend"
        />
        <TrendChart
          series={[
            {
              id: "second",
              label: "Second",
              points: [
                { x: "A", y: 12 },
                { x: "B", y: 16 },
              ],
              style: "solid",
              area: true,
            },
          ]}
          yDomain={[0, 40]}
          yTicks={[0, 20, 40]}
          xLabels={["A", "B"]}
          height={120}
          ariaLabel="Second trend"
        />
      </div>,
    );

    const gradientIds = Array.from(
      document.querySelectorAll("linearGradient"),
      (gradient) => gradient.id,
    );
    expect(gradientIds).toHaveLength(2);
    expect(new Set(gradientIds).size).toBe(2);
  });

  it("renders grouped bars with value labels", () => {
    render(
      <BarCompareChart
        groups={[
          { id: "chatgpt", label: "ChatGPT", values: { observed: 8, baseline: 5 } },
          { id: "claude", label: "Claude", values: { observed: 5, baseline: 3 } },
          { id: "perplexity", label: "Perplexity", values: { observed: 3, baseline: 2 } },
        ]}
        series={[
          { id: "observed", label: "Observed" },
          { id: "baseline", label: "Baseline" },
        ]}
        yTicks={[0, 2, 4, 6, 8]}
        height={180}
        showValues
        ariaLabel="Engine comparison"
      />,
    );

    expect(screen.getByRole("img", { name: "Engine comparison" })).toBeTruthy();
    expect(screen.getAllByTestId("bar-series-bar")).toHaveLength(6);
    expect(screen.getAllByTestId("bar-value")).toHaveLength(6);
    expect(document.querySelectorAll('[data-chart-element="axis-x-label"]')).toHaveLength(3);
  });

  it("renders donut segments with proportional arc lengths", () => {
    render(
      <DonutChart
        segments={[
          { id: "mentions", label: "Mentions", value: 18 },
          { id: "citations", label: "Citations", value: 11 },
          { id: "failures", label: "Failures", value: 6 },
          { id: "unmeasured", label: "Unmeasured", value: 5 },
        ]}
        centreValue="11"
        centreCaption="Citations"
        size={112}
        thickness={14}
        legend
      />,
    );

    expect(screen.getByRole("img", { name: /18 mentions, 11 citations/i })).toBeTruthy();
    const segments = screen.getAllByTestId("donut-segment");
    expect(segments).toHaveLength(4);
    const firstLength = Number.parseFloat(
      segments[0].getAttribute("stroke-dasharray")?.split(" ")[0] ?? "0",
    );
    const secondLength = Number.parseFloat(
      segments[1].getAttribute("stroke-dasharray")?.split(" ")[0] ?? "0",
    );
    expect(firstLength / secondLength).toBeCloseTo(18 / 11, 5);
  });

  it("renders a sparkline and its optional trailing delta", () => {
    render(<Sparkline points={[18, 20, 20, 24]} width={96} height={26} trend="up" delta="+33%" />);

    expect(screen.getByRole("img", { name: /sparkline/i })).toBeTruthy();
    expect(screen.getByTestId("sparkline-line")).toBeTruthy();
    expect(screen.getByText("+33%")).toBeTruthy();
  });

  it("renders an accessible usage meter with a numeric count", () => {
    render(<UsageMeter label="History storage" used={42} limit={90} unit="GB" />);

    expect(screen.getByRole("img", { name: "History storage: 42 GB of 90 GB" })).toBeTruthy();
    expect(screen.getByText("42 GB of 90 GB")).toBeTruthy();
    expect(screen.getByTestId("usage-meter-bar")).toBeTruthy();
  });
});
