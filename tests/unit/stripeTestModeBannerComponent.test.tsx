// @vitest-environment happy-dom
//
// Component-level half of the test-mode banner coverage. Split from
// tests/unit/stripeTestModeBanner.test.ts because that file imports
// server/routes/billing.ts, which constructs a real OpenAI client at import
// time - and the OpenAI SDK refuses to run under happy-dom ("It looks like
// you're running in a browser-like environment"). Rendering a React
// component needs a DOM; importing the route file needs a plain Node
// environment. They cannot share a vitest environment pragma.
//
// See tests/unit/stripeTestModeBanner.test.ts for the rest of this
// invariant's coverage (key detection, the route, the boot warning) and for
// why these replaced a source-text version of this file.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const queryState = vi.hoisted(() => ({ testMode: undefined as boolean | undefined }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { testMode: queryState.testMode } }),
}));

const { TestModeBanner } = await import("@/components/TrialGate");

describe("TestModeBanner", () => {
  beforeEach(() => {
    queryState.testMode = undefined;
  });

  it("renders nothing on live keys", () => {
    queryState.testMode = false;
    const { container } = render(<TestModeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing before the catalogue has loaded", () => {
    queryState.testMode = undefined;
    const { container } = render(<TestModeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("announces test mode, and cannot be dismissed", () => {
    queryState.testMode = true;
    const { container } = render(<TestModeBanner />);

    expect(screen.getByText(/test mode/i)).toBeTruthy();
    // A banner you can hide is one you stop seeing on the day it matters -
    // there is no button, link, or other control to dismiss it.
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });
});
