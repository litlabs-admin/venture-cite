// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { FirstReadStep } from "../../client/src/components/onboarding/LeftSteps";
import type { Probe } from "../../shared/onboarding/session";

const prompts = ["best pr agencies for tech", "top tech pr firms", "leading pr agencies"];

// Three prompts on two engines: six answers, the shape production returned.
const probe = {
  promptsTested: 3,
  results: prompts.flatMap((prompt) =>
    (["Gemini", "ChatGPT"] as const).map((engine) => ({
      prompt,
      engine,
      brandCited: false,
      mentioned: [{ name: "Highwire" }],
      snippet: `answer from ${engine}`,
    })),
  ),
} as unknown as Probe;

const base = {
  brandName: "Venture PR",
  favicon: "",
  probeError: null,
  prompts,
  insight: null,
  insightError: null,
  onContinue: () => {},
};

describe("FirstReadStep", () => {
  it("shows the live prompts with spinners while the probe runs", () => {
    const { getByTestId, getByText } = render(<FirstReadStep {...base} probe={null} />);
    expect(getByTestId("first-read-pending")).toBeTruthy();
    for (const p of prompts) expect(getByText(p)).toBeTruthy();
  });

  it("shows one brand row and one sample answer, not a row per prompt and engine", () => {
    const { container, getByText, queryAllByText } = render(
      <FirstReadStep {...base} probe={probe} />,
    );
    expect(getByText("Not cited across 3 prompts")).toBeTruthy();
    expect(queryAllByText(/Not named/i)).toHaveLength(0);
    // Only the sample answer quotes a prompt.
    expect(container.textContent?.match(/best pr agencies for tech/g)).toHaveLength(1);
  });
});
