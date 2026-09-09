// @vitest-environment happy-dom
//
// `index.css:580` aliases `--warning` to `--brand-accent`, so two states
// painted with warning tokens would render as the same colour. These tests
// assert the distinction is carried by glyph and words instead, which is the
// only way it can survive that alias (and the only way it reaches a
// colour-blind reader at all).

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { StateBadge } from "@/v2/state/StateBadge";

const STATES = ["not_measured", "inactive", "failed", "no_finding"] as const;

describe("StateBadge", () => {
  it("gives every state a distinct label", () => {
    const labels = STATES.map((s) => render(<StateBadge state={s} />).container.textContent);
    expect(new Set(labels).size).toBe(4);
  });

  it("gives every state a distinct glyph, so colour is never the only signal", () => {
    const glyphs = STATES.map((s) =>
      render(<StateBadge state={s} />)
        .container.querySelector("[data-glyph]")
        ?.getAttribute("data-glyph"),
    );
    expect(glyphs.every(Boolean)).toBe(true);
    expect(new Set(glyphs).size).toBe(4);
  });

  it("never claims reassurance for an inactive detector", () => {
    const { container } = render(<StateBadge state="inactive" />);
    expect(container.textContent).not.toMatch(/no (problems|issues) found/i);
  });
});
