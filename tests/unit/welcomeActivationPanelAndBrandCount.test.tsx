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
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/lib/authStore", () => ({
  getAccessToken: async () => null,
}));

// `pending.data` is what the page's queryFn returns: the body parsed with
// pendingResponseSchema, i.e. `{ sessionId }`. This mock once used a nested
// `{ data: { sessionId } }` shape the server never sent, which let a page that
// never claimed anything pass these tests.
const queryState = vi.hoisted(() => ({
  brands: { data: undefined as unknown, isLoading: false, isError: false, isSuccess: false },
  pending: { data: { sessionId: null } as unknown, isLoading: false, isError: false },
}));
const claimMutate = vi.hoisted(() => vi.fn());

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
    if (key === "/api/onboarding/pending") {
      return {
        data: queryState.pending.data,
        isLoading: queryState.pending.isLoading,
        isError: queryState.pending.isError,
        refetch: vi.fn(),
      };
    }
    // autopilot-status query - inert while scene is "checking" in every test
    // below (`enabled` is computed by the real component, but this stub
    // doesn't honor it - a call with no data at all is a safe default).
    return { data: undefined, isError: false, refetch: vi.fn() };
  },
  useMutation: () => ({ mutate: claimMutate, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), refetchQueries: vi.fn() }),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn(), refetchQueries: vi.fn() },
}));

const { default: Welcome } = await import("@/pages/welcome");

describe("Welcome - a failed brand check is not the same as zero brands", () => {
  it("shows a loading state, not a redirect, while the check is in flight", () => {
    queryState.brands = { data: undefined, isLoading: true, isError: false, isSuccess: false };
    render(<Welcome />);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows a distinct, retryable error - not a redirect - when /api/brands fails", () => {
    queryState.brands = { data: undefined, isLoading: false, isError: true, isSuccess: false };
    render(<Welcome />);

    // Before the fix (carried into the /start-redesign): `brandCount` must
    // not fall back to `0` here exactly like a genuinely brand-less
    // account, which would otherwise redirect to /start with no indication
    // anything had failed.
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByText(/couldn't check your account/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });

  it("sends the user to /start once /api/brands confirms zero brands and there is no pending session", () => {
    queryState.brands = {
      data: { success: true, data: [] },
      isLoading: false,
      isError: false,
      isSuccess: true,
    };
    queryState.pending = { data: { sessionId: null }, isLoading: false, isError: false };
    render(<Welcome />);
    expect(navigateMock).toHaveBeenCalledWith({ to: "/start" });
  });

  // Seen live 2026-09-19: a verified user with a pending session logged in,
  // the page misread the response, and they were sent back to step 1.
  it("claims the pending session instead of redirecting when one exists", () => {
    claimMutate.mockClear();
    navigateMock.mockClear();
    queryState.brands = {
      data: { success: true, data: [] },
      isLoading: false,
      isError: false,
      isSuccess: true,
    };
    queryState.pending = {
      data: { sessionId: "22222222-2222-4222-8222-222222222222" },
      isLoading: false,
      isError: false,
    };
    render(<Welcome />);
    expect(claimMutate).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
    expect(navigateMock).not.toHaveBeenCalledWith({ to: "/start" });
  });

  it("shows an error, not a redirect to /start, when the pending check fails", () => {
    claimMutate.mockClear();
    navigateMock.mockClear();
    queryState.brands = {
      data: { success: true, data: [] },
      isLoading: false,
      isError: false,
      isSuccess: true,
    };
    queryState.pending = { data: undefined, isLoading: false, isError: true };
    render(<Welcome />);
    expect(navigateMock).not.toHaveBeenCalled();
    expect(claimMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/couldn't check for your saved setup/i)).toBeTruthy();
  });
});
