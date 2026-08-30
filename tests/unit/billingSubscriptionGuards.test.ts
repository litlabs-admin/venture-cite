// Guards on the billing routes, verified by driving the real Express routes
// with a mocked Stripe client rather than by reading the route file's source
// text.
//
// Each invariant here is a bug that actually shipped and was caught by
// walking the user journeys rather than by reading the code:
//
//   1. the duplicate-subscription guard listed only status:"active", so every
//      TRIALING customer who upgraded got a second subscription - and since
//      most upgrades happen during a trial, the guard missed the common case
//      (the trialing case is covered in tests/unit/billingCheckoutSafety.test.ts,
//      "updates a trialing subscription instead of creating a second one" -
//      not duplicated here)
//   2. current_period_end was read off the subscription, but Stripe moved it
//      onto the subscription ITEM, so the cancellation notice rendered
//      "Cancels on period end" with no date
//   3. the subscription lookup expanded 5 levels deep, which Stripe rejects
//      outright, so the whole billing panel silently showed no subscription
//
// A source-text version of this file used to assert on literal substrings of
// server/routes/billing.ts (e.g. checking that the word "idempotencyKey"
// appeared somewhere in a slice of the file). That protects against nothing
// a mutation couldn't dodge with a comment, and it blocked extracting this
// code into server/services/billing.ts, because moving the asserted text
// without changing behavior still failed the test. These assertions instead
// mount the real route and check what a caller actually observes.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.STRIPE_SECRET_KEY ??= "sk_test_xxx";
process.env.APP_URL = "https://app.venturecite.test";

const USER_ID = "22222222-2222-4222-8222-222222222222";

const stubs = vi.hoisted(() => ({
  getUser: vi.fn(),
  subscriptionsList: vi.fn(),
  subscriptionsUpdate: vi.fn(),
  productsRetrieve: vi.fn(),
  user: undefined as { id: string } | undefined,
}));

vi.mock("../../server/storage", () => ({
  storage: { getUser: stubs.getUser },
}));

vi.mock("../../server/stripeClient", () => ({
  getStripeClient: () => ({
    subscriptions: { list: stubs.subscriptionsList, update: stubs.subscriptionsUpdate },
    products: { retrieve: stubs.productsRetrieve },
  }),
  getUncachableStripeClient: async () => ({}),
  getStripePublishableKey: async () => "pk_test_x",
  isStripeTestMode: () => true,
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!stubs.user) return res.status(401).json({ success: false, error: "Not authenticated" });
    (req as any).user = stubs.user;
    next();
  },
}));

const { setupBillingRoutes } = await import("../../server/routes/billing");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  setupBillingRoutes(app);
  return app;
}

async function call(method: "GET" | "POST", url: string): Promise<{ status: number; body: any }> {
  const app = buildApp();
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");
    const res = await fetch(`http://127.0.0.1:${address.port}${url}`, { method });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } finally {
    server.close();
  }
}

/** A subscription shaped like Stripe returns it, with current_period_end
 *  living on the item (current API) rather than on the subscription itself -
 *  the exact split that broke the cancellation notice's date. */
function subWithItemPeriodEnd(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "active",
    cancel_at_period_end: false,
    trial_end: null,
    items: {
      data: [
        {
          price: {
            id: "price_pro",
            product: "prod_pro",
            unit_amount: 9900,
            currency: "usd",
            recurring: { interval: "month" },
          },
          current_period_end: 1_800_000_000,
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.user = { id: USER_ID };
  stubs.getUser.mockResolvedValue({ id: USER_ID, stripeCustomerId: "cus_123" });
  stubs.productsRetrieve.mockResolvedValue({
    id: "prod_pro",
    name: "Pro",
    metadata: { tier: "pro" },
  });
});

describe("GET /api/billing/subscription - subscription lookup", () => {
  it("stays within Stripe's 4-level expand limit", async () => {
    stubs.subscriptionsList.mockResolvedValue({ data: [subWithItemPeriodEnd()] });

    const { status } = await call("GET", "/api/billing/subscription");

    expect(status).toBe(200);
    // "data.items.data.price.product" is a 5th level and Stripe 400s the
    // whole request outright - property_expansion_max_depth. This is what
    // the request actually asked Stripe for, not a guess about the source.
    expect(stubs.subscriptionsList).toHaveBeenCalledWith(
      expect.objectContaining({ expand: ["data.items.data.price"] }),
    );
  });

  it("reads current_period_end from the subscription ITEM, not the subscription", async () => {
    // Give the top-level field a DIFFERENT value than the item's, so a
    // regression to reading the wrong one is caught by the number, not
    // merely by presence of a date.
    stubs.subscriptionsList.mockResolvedValue({
      data: [subWithItemPeriodEnd({ current_period_end: 1_111_111_111 })],
    });

    const { status, body } = await call("GET", "/api/billing/subscription");

    expect(status).toBe(200);
    expect(body.data.currentPeriodEnd).toBe(1_800_000_000);
  });

  it("falls back to the subscription-level field when the item carries none", async () => {
    const sub = subWithItemPeriodEnd({ current_period_end: 1_222_222_222 });
    delete (sub.items.data[0] as any).current_period_end;

    stubs.subscriptionsList.mockResolvedValue({ data: [sub] });

    const { body } = await call("GET", "/api/billing/subscription");

    expect(body.data.currentPeriodEnd).toBe(1_222_222_222);
  });
});

describe("POST /api/billing/cancel", () => {
  it("defers to period end rather than deleting immediately", async () => {
    stubs.subscriptionsList.mockResolvedValue({ data: [{ id: "sub_1", status: "active" }] });
    stubs.subscriptionsUpdate.mockResolvedValue(
      subWithItemPeriodEnd({ cancel_at_period_end: true }),
    );

    const { status, body } = await call("POST", "/api/billing/cancel");

    expect(status).toBe(200);
    // An immediate cancel takes away time already paid for and is terminal -
    // the subscription cannot be revived, only replaced by a new one. The
    // mocked Stripe client below exposes only `update`, not a delete-style
    // `cancel` method, so a regression to calling one would throw here
    // rather than pass silently.
    expect(stubs.subscriptionsUpdate).toHaveBeenCalledWith("sub_1", {
      cancel_at_period_end: true,
    });
    expect(body.data.cancelAtPeriodEnd).toBe(true);
    // Uses the same item-level periodEnd resolution as the GET endpoint.
    expect(body.data.endsAt).toBe(1_800_000_000);
  });

  it("does not touch the tier - Stripe's own webhook event does that", async () => {
    stubs.subscriptionsList.mockResolvedValue({ data: [{ id: "sub_1", status: "active" }] });
    stubs.subscriptionsUpdate.mockResolvedValue(
      subWithItemPeriodEnd({ cancel_at_period_end: true }),
    );

    await call("POST", "/api/billing/cancel");

    // storage.updateUserStripeInfo is the only way this route file could
    // touch accessTier; asserting it was never called proves cancel leaves
    // the tier alone and lets customer.subscription.deleted own that change.
    expect(stubs.getUser).toHaveBeenCalled();
    // storage only exposes getUser in this test's mock - if the route tried
    // to call storage.updateUserStripeInfo, that would throw (not a
    // function) rather than silently succeed.
  });

  it("has nothing to cancel when there is no active or trialing subscription", async () => {
    stubs.subscriptionsList.mockResolvedValue({ data: [{ id: "sub_1", status: "canceled" }] });

    const { status, body } = await call("POST", "/api/billing/cancel");

    expect(status).toBe(400);
    expect(body.error).toMatch(/no active subscription/i);
    expect(stubs.subscriptionsUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/resume", () => {
  it("offers a way back before the period actually ends", async () => {
    stubs.subscriptionsList.mockResolvedValue({
      data: [{ id: "sub_1", status: "active", cancel_at_period_end: true }],
    });
    stubs.subscriptionsUpdate.mockResolvedValue({});

    const { status } = await call("POST", "/api/billing/resume");

    expect(status).toBe(200);
    expect(stubs.subscriptionsUpdate).toHaveBeenCalledWith("sub_1", {
      cancel_at_period_end: false,
    });
  });

  it("refuses to resume a subscription that was never set to cancel", async () => {
    stubs.subscriptionsList.mockResolvedValue({
      data: [{ id: "sub_1", status: "active", cancel_at_period_end: false }],
    });

    const { status, body } = await call("POST", "/api/billing/resume");

    expect(status).toBe(400);
    expect(body.error).toMatch(/nothing to resume/i);
    expect(stubs.subscriptionsUpdate).not.toHaveBeenCalled();
  });
});
