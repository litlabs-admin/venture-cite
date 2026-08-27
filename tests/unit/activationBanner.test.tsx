// @vitest-environment happy-dom
//
// What the user actually sees while a new brand is being built.
//
// The failure this guards against is subtle and silent in both directions:
//   - banner missing while work is in flight -> the dashboard looks broken
//     and finished, when it is neither
//   - banner present after the pipeline completed -> we permanently tell the
//     user we are working on something we are not, and the honest empty
//     states ("no cited URLs in the last 30 days") get overridden by a lie

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const activationStub = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("@/hooks/useBrandActivation", () => ({
  useBrandActivation: () => activationStub.value,
  activationPhaseLabel: (s: string) => s,
}));

const { ActivationBanner } = await import("@/components/dashboard-panels/ActivationBanner");

function setActivation(v: Record<string, unknown>) {
  activationStub.value = {
    isActivating: false,
    hasFailed: false,
    phaseLabel: "",
    activation: null,
    ...v,
  };
}

describe("ActivationBanner", () => {
  beforeEach(() => setActivation({}));

  it("renders nothing once the brand is activated", () => {
    setActivation({ isActivating: false, hasFailed: false });
    const { container } = render(<ActivationBanner brandId="b1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing before the first status response", () => {
    // Must not flash on a fully-populated dashboard during the initial fetch.
    setActivation({ isActivating: false, hasFailed: false, activation: null });
    const { container } = render(<ActivationBanner brandId="b1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the current phase while work is in flight", () => {
    setActivation({
      isActivating: true,
      phaseLabel: "Asking the AI engines about you",
      activation: { progress: {} },
    });
    render(<ActivationBanner brandId="b1" />);
    expect(screen.getByText(/Asking the AI engines about you/)).toBeTruthy();
  });

  it("shows real citation progress when the pipeline reports a count", () => {
    setActivation({
      isActivating: true,
      phaseLabel: "Asking the AI engines about you",
      activation: { progress: { citationsRun: 12, citationsTotal: 60 } },
    });
    render(<ActivationBanner brandId="b1" />);
    expect(screen.getByText(/12 of 60/)).toBeTruthy();
  });

  it("omits the counter rather than inventing one when no count is reported", () => {
    // Every phase except citations has no real numerator/denominator. A fake
    // percentage would be a fabricated measurement.
    setActivation({
      isActivating: true,
      phaseLabel: "Reading your website",
      activation: { progress: {} },
    });
    render(<ActivationBanner brandId="b1" />);
    expect(screen.queryByText(/ of /)).toBeNull();
  });

  it("tells the user plainly when setup stopped early", () => {
    setActivation({ hasFailed: true });
    render(<ActivationBanner brandId="b1" />);
    expect(screen.getByText(/didn't finish/i)).toBeTruthy();
  });

  it("does not claim work is ongoing when the run failed", () => {
    setActivation({ hasFailed: true });
    render(<ActivationBanner brandId="b1" />);
    expect(screen.queryByText(/Building your dashboard/)).toBeNull();
  });

  it("announces itself to assistive tech", () => {
    setActivation({ isActivating: true, phaseLabel: "Getting started", activation: null });
    const { container } = render(<ActivationBanner brandId="b1" />);
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });
});
