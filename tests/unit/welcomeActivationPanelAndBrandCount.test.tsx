// @vitest-environment happy-dom
//
// B9 UI/UX remainder (B7-20): two welcome.tsx defects carried forward from
// the prior audit pass, unverified. Both confirmed real against current
// code before fixing (see .audit/B7/B7-20-ui-remainder.md):
//
// 1. ActivationPanel's Retry button only ever rendered on
//    `autopilot?.status === "failed"`. The `/api/onboarding/autopilot-status`
//    poll's own `isError` was never read, so a persistently-failing status
//    *check* (network blip, 500 on that one endpoint) never produced a
//    `status: "failed"` to read - it left `autopilot` null forever, which
//    `ActivationPanel` defaulted to `status: "pending"`, rendering
//    "Working" indefinitely with no way out. Separately, the query's own
//    `refetchInterval` returned `false` the instant `status` was undefined
//    (exactly what an erroring fetch produces), so the poll didn't even
//    keep trying.
//
// 2. `welcome.tsx`'s `existingBrands` query fell back to `brandCount = 0`
//    on ANY outcome other than a successful non-empty response - including
//    a failed `/api/brands` fetch. That is indistinguishable from a
//    genuinely brand-less account, so a returning customer hitting a
//    transient `/api/brands` failure was shown the "Let's establish your
//    brand" onboarding form instead of being sent to /dashboard or told
//    the check failed.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------
// Part 1: ActivationPanel - a failing status check must not look like
// "Working" forever, and must offer a way out.
// ---------------------------------------------------------------------
import { ActivationPanel } from "@/pages/welcome";
import type { ComponentProps } from "react";

function baseProps(): ComponentProps<typeof ActivationPanel> {
  return {
    brandName: "Acme",
    autopilot: null,
    autopilotIsError: false,
    onGoToDashboard: vi.fn(),
    onRetry: vi.fn(),
    onRefetchStatus: vi.fn(),
    retrying: false,
  };
}

describe("ActivationPanel - a failing status check surfaces a retry, not a permanent 'Working'", () => {
  it("shows 'Working' with no way out when the check has NOT (yet) errored - the ordinary in-progress case", () => {
    render(<ActivationPanel {...baseProps()} />);
    expect(screen.getByText("Working")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /check again/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^retry$/i })).toBeNull();
  });

  it("stops claiming 'Working' and offers 'Check again' once the status check is erroring", async () => {
    const onRefetchStatus = vi.fn();
    const user = userEvent.setup();
    render(<ActivationPanel {...baseProps()} autopilotIsError onRefetchStatus={onRefetchStatus} />);

    // Before the fix: `autopilot` stays null on a query error, `status`
    // defaults to "pending", and nothing in ActivationPanel ever read
    // `autopilotIsError` (the prop did not exist) - so this rendered
    // exactly like the ordinary in-progress case above, forever.
    expect(screen.queryByText("Working")).toBeNull();
    expect(screen.getByText("Setup interrupted")).toBeTruthy();

    const checkAgain = screen.getByRole("button", { name: /check again/i });
    await user.click(checkAgain);
    expect(onRefetchStatus).toHaveBeenCalledTimes(1);
  });

  it("keeps the job-failure Retry path separate from the check-failure path", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <ActivationPanel
        {...baseProps()}
        onRetry={onRetry}
        autopilot={{ status: "failed", step: 0, progress: null, error: "The scrape timed out" }}
      />,
    );

    expect(screen.getByText("The scrape timed out")).toBeTruthy();
    const retry = screen.getByRole("button", { name: /^retry$/i });
    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------
// Part 2: welcome.tsx - a failed /api/brands must not read as "confirmed
// zero brands" and silently show the create-a-brand form.
// ---------------------------------------------------------------------
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/authStore", () => ({
  getAccessToken: async () => null,
}));

const queryState = vi.hoisted(() => ({
  brands: { data: undefined as unknown, isLoading: false, isError: false, isSuccess: false },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: readonly unknown[] }) => {
    const key = String(options.queryKey[0]);
    if (key === "/api/brands") {
      return {
        data: queryState.brands.data,
        isLoading: queryState.brands.isLoading,
        isError: queryState.brands.isError,
        isSuccess: queryState.brands.isSuccess,
        refetch: vi.fn(),
      };
    }
    // autopilot-status query - inert while scene is "input" in every test
    // below (`enabled` is computed by the real component, but this stub
    // doesn't honor it - a call with no data at all is a safe default).
    return { data: undefined, isError: false, refetch: vi.fn() };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), refetchQueries: vi.fn() }),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn(), refetchQueries: vi.fn() },
}));

const { default: Welcome } = await import("@/pages/welcome");

describe("Welcome - a failed brand check is not the same as zero brands", () => {
  it("shows a loading state, not the create-a-brand form, while the check is in flight", () => {
    queryState.brands = { data: undefined, isLoading: true, isError: false, isSuccess: false };
    render(<Welcome />);
    expect(screen.queryByText("Let's establish your brand")).toBeNull();
    expect(screen.queryByTestId("input-website")).toBeNull();
  });

  it("shows a distinct, retryable error - not the onboarding form - when /api/brands fails", () => {
    queryState.brands = { data: undefined, isLoading: false, isError: true, isSuccess: false };
    render(<Welcome />);

    // Before the fix: `brandCount` fell back to `0` here exactly like a
    // genuinely brand-less account, so this rendered the ordinary
    // onboarding form with no indication anything had failed.
    expect(screen.queryByText("Let's establish your brand")).toBeNull();
    expect(screen.queryByTestId("input-website")).toBeNull();
    expect(screen.getByText(/couldn't check your account/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  it("still shows the ordinary onboarding form once /api/brands confirms zero brands", () => {
    queryState.brands = {
      data: { success: true, data: [] },
      isLoading: false,
      isError: false,
      isSuccess: true,
    };
    render(<Welcome />);
    expect(screen.getByTestId("input-website")).toBeTruthy();
  });
});
