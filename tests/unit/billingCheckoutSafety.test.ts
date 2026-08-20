import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { PLAN_PRICE_CENTS } from "@shared/schema";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.STRIPE_SECRET_KEY ??= "sk_test_xxx";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";
process.env.APP_URL = "https://app.venturecite.test";
process.env.STRIPE_PRO_PRODUCT_ID = "prod_pro";
process.env.STRIPE_PRO_PRICE_ID = "price_pro";
process.env.STRIPE_AGENCY_PRODUCT_ID = "prod_agency";
process.env.STRIPE_AGENCY_PRICE_ID = "price_agency";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_RECOVERY_KEY = "39da1aeeaf86ae8c140674cc85bfa64201a366e7762d4237b1ffba398b861217";

const stubs = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUserStripeInfo: vi.fn(),
  priceRetrieve: vi.fn(),
  subscriptionsList: vi.fn(),
  subscriptionsUpdate: vi.fn(),
  checkoutCreate: vi.fn(),
  checkoutList: vi.fn(),
  checkoutExpire: vi.fn(),
  customerCreate: vi.fn(),
  customerSearch: vi.fn(),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getUser: stubs.getUser,
    updateUserStripeInfo: stubs.updateUserStripeInfo,
  },
}));

vi.mock("../../server/stripeClient", () => ({
  getUncachableStripeClient: async () => ({
    prices: { retrieve: stubs.priceRetrieve },
    subscriptions: { list: stubs.subscriptionsList, update: stubs.subscriptionsUpdate },
    checkout: {
      sessions: {
        create: stubs.checkoutCreate,
        list: stubs.checkoutList,
        expire: stubs.checkoutExpire,
      },
    },
    customers: { create: stubs.customerCreate, search: stubs.customerSearch },
  }),
  getStripeClient: vi.fn(),
  getStripePublishableKey: async () => "pk_test_x",
  isStripeTestMode: () => true,
}));

vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

vi.mock("../../server/auth", () => ({
  isAuthenticated: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

const { setupBillingRoutes } = await import("../../server/routes/billing");

function validPrice(overrides: Record<string, unknown> = {}) {
  return {
    id: "price_pro",
    active: true,
    currency: "usd",
    unit_amount: PLAN_PRICE_CENTS.pro,
    recurring: { interval: "month", interval_count: 1 },
    product: {
      id: "prod_pro",
      object: "product",
      active: true,
      metadata: { tier: "pro" },
    },
    ...overrides,
  };
}

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: USER_ID };
    next();
  });
  setupBillingRoutes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.getUser.mockResolvedValue({ id: USER_ID, stripeCustomerId: "cus_123" });
  stubs.priceRetrieve.mockResolvedValue(validPrice());
  stubs.subscriptionsList.mockResolvedValue({ data: [] });
  stubs.subscriptionsUpdate.mockResolvedValue({ id: "sub_current" });
  stubs.checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
  stubs.checkoutList.mockResolvedValue({ data: [] });
  stubs.checkoutExpire.mockResolvedValue({});
  stubs.customerCreate.mockResolvedValue({ id: "cus_new" });
  stubs.customerSearch.mockResolvedValue({ data: [] });
  stubs.updateUserStripeInfo.mockResolvedValue(undefined);
});

describe("POST /api/stripe/checkout safety", () => {
  it("uses only server-controlled redirect URLs", async () => {
    const response = await fetchCheckout({
      priceId: "price_pro",
      successUrl: "https://attacker.test/success",
      cancelUrl: "https://attacker.test/cancel",
    });
    expect(response.status).toBe(200);
    expect(stubs.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://app.venturecite.test/welcome?checkout=success",
        cancel_url: "https://app.venturecite.test/pricing?canceled=true",
      }),
      expect.any(Object),
    );
  });

  it.each([
    [
      "unknown tier",
      validPrice({ product: { id: "prod_x", active: true, metadata: { tier: "free" } } }),
    ],
    ["wrong currency", validPrice({ currency: "eur" })],
    ["wrong interval", validPrice({ recurring: { interval: "year" } })],
    ["wrong interval count", validPrice({ recurring: { interval: "month", interval_count: 2 } })],
    ["wrong amount", validPrice({ unit_amount: 7900 })],
    [
      "inactive product",
      validPrice({ product: { id: "prod_pro", active: false, metadata: { tier: "pro" } } }),
    ],
    ["wrong price identity", validPrice({ id: "price_other" })],
  ])("rejects a catalog entry with %s", async (_label, price) => {
    stubs.priceRetrieve.mockResolvedValue(price);
    const response = await fetchCheckout({ priceId: "price_pro" });
    expect(response.status).toBe(400);
    expect(stubs.checkoutCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown price ID", validPrice({ id: "price_unknown" }), "price_unknown"],
    [
      "an unknown product ID",
      validPrice({ product: { id: "prod_unknown", active: true, metadata: { tier: "pro" } } }),
      "price_pro",
    ],
  ])("rejects %s with approved plan attributes", async (_label, price, priceId) => {
    stubs.priceRetrieve.mockResolvedValue(price);

    const response = await fetchCheckout({ priceId });

    expect(response.status).toBe(400);
    expect(stubs.checkoutCreate).not.toHaveBeenCalled();
  });

  it("creates one session for two concurrent checkout requests", async () => {
    let releaseCreate: (() => void) | undefined;
    let sessionCreated = false;
    stubs.checkoutList.mockImplementation(async () => ({
      data: sessionCreated
        ? [
            {
              id: "cs_open",
              url: "https://checkout.stripe.test/session",
              client_reference_id: USER_ID,
              metadata: { venturecitePriceId: "price_pro" },
            },
          ]
        : [],
    }));
    stubs.checkoutCreate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseCreate = () => {
            sessionCreated = true;
            resolve({ id: "cs_open", url: "https://checkout.stripe.test/session" });
          };
        }),
    );

    const first = fetchCheckout({ priceId: "price_pro" });
    await vi.waitFor(() => expect(stubs.checkoutCreate).toHaveBeenCalledTimes(1));
    const second = fetchCheckout({ priceId: "price_pro" });
    releaseCreate?.();

    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(stubs.checkoutCreate).toHaveBeenCalledTimes(1);
  });

  it("expires extra open sessions before it reuses one session", async () => {
    stubs.checkoutList.mockResolvedValue({
      data: [
        {
          id: "cs_keep",
          url: "https://checkout.stripe.test/keep",
          client_reference_id: USER_ID,
          metadata: { venturecitePriceId: "price_pro" },
        },
        {
          id: "cs_extra",
          url: "https://checkout.stripe.test/extra",
          client_reference_id: USER_ID,
          metadata: { venturecitePriceId: "price_pro" },
        },
      ],
    });

    const response = await fetchCheckout({ priceId: "price_pro" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      url: "https://checkout.stripe.test/keep",
    });
    expect(stubs.checkoutExpire).toHaveBeenCalledOnce();
    expect(stubs.checkoutExpire).toHaveBeenCalledWith("cs_extra");
    expect(stubs.checkoutCreate).not.toHaveBeenCalled();
  });

  it("does not grant a second trial after a prior subscription", async () => {
    stubs.subscriptionsList.mockResolvedValue({
      data: [{ id: "sub_old", status: "canceled", items: { data: [] } }],
    });
    const response = await fetchCheckout({ priceId: "price_pro" });
    expect(response.status).toBe(200);
    expect(stubs.checkoutCreate).toHaveBeenCalledWith(
      expect.not.objectContaining({ subscription_data: expect.anything() }),
      expect.any(Object),
    );
  });

  it("updates a past-due subscription instead of creating a second subscription", async () => {
    stubs.subscriptionsList.mockResolvedValue({
      data: [
        {
          id: "sub_current",
          status: "past_due",
          items: { data: [{ id: "si_current", price: { id: "price_agency" } }] },
        },
      ],
    });

    const response = await fetchCheckout({ priceId: "price_pro" });

    expect(response.status).toBe(200);
    expect(stubs.subscriptionsUpdate).toHaveBeenCalledWith(
      "sub_current",
      expect.objectContaining({ items: [{ id: "si_current", price: "price_pro" }] }),
    );
    expect(stubs.checkoutCreate).not.toHaveBeenCalled();
  });

  it("does not grant a second trial when the user row records prior subscription history", async () => {
    stubs.getUser.mockResolvedValue({
      id: USER_ID,
      stripeCustomerId: null,
      stripeSubscriptionId: "sub_old",
    });
    const response = await fetchCheckout({ priceId: "price_pro" });
    expect(response.status).toBe(200);
    expect(stubs.checkoutCreate).toHaveBeenCalledWith(
      expect.not.objectContaining({ subscription_data: expect.anything() }),
      expect.any(Object),
    );
  });

  it("uses one stable idempotency key for customer creation retries", async () => {
    stubs.getUser.mockResolvedValue({
      id: USER_ID,
      email: "buyer@example.test",
      stripeCustomerId: null,
    });

    const response = await fetchCheckout({ priceId: "price_pro" });

    expect(response.status).toBe(200);
    expect(stubs.customerCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ userId: USER_ID }) }),
      { idempotencyKey: expect.stringMatching(/^customer:[a-f0-9]{64}$/) },
    );
  });

  it("recovers an orphaned customer before it creates another customer", async () => {
    stubs.getUser.mockResolvedValue({
      id: USER_ID,
      email: "buyer@example.test",
      stripeCustomerId: null,
    });
    stubs.customerSearch.mockResolvedValue({
      data: [
        {
          id: "cus_orphan",
          metadata: { userId: USER_ID, ventureciteRecoveryKey: CUSTOMER_RECOVERY_KEY },
        },
      ],
    });

    const response = await fetchCheckout({ priceId: "price_pro" });

    expect(response.status).toBe(200);
    expect(stubs.customerSearch).toHaveBeenCalledWith({
      query: `metadata['ventureciteRecoveryKey']:'${CUSTOMER_RECOVERY_KEY}'`,
      limit: 10,
    });
    expect(stubs.customerCreate).not.toHaveBeenCalled();
    expect(stubs.updateUserStripeInfo).toHaveBeenCalledWith(USER_ID, {
      stripeCustomerId: "cus_orphan",
    });
    expect(stubs.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_orphan" }),
      expect.any(Object),
    );
  });

  it("recovers the created customer after the first database write fails", async () => {
    stubs.getUser.mockResolvedValue({
      id: USER_ID,
      email: "buyer@example.test",
      stripeCustomerId: null,
    });
    stubs.customerSearch.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({
      data: [
        {
          id: "cus_new",
          metadata: { userId: USER_ID, ventureciteRecoveryKey: CUSTOMER_RECOVERY_KEY },
        },
      ],
    });
    stubs.updateUserStripeInfo
      .mockRejectedValueOnce(new Error("Database write failed"))
      .mockResolvedValueOnce(undefined);

    const firstResponse = await fetchCheckout({ priceId: "price_pro" });
    const retryResponse = await fetchCheckout({ priceId: "price_pro" });

    expect(firstResponse.status).toBe(500);
    expect(retryResponse.status).toBe(200);
    expect(stubs.customerCreate).toHaveBeenCalledTimes(1);
    expect(stubs.updateUserStripeInfo).toHaveBeenLastCalledWith(USER_ID, {
      stripeCustomerId: "cus_new",
    });
  });
});

async function fetchCheckout(body: unknown): Promise<Response> {
  const app = buildApp();
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");
    return await fetch(`http://127.0.0.1:${address.port}/api/stripe/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json", host: "attacker.test" },
      body: JSON.stringify(body),
    });
  } finally {
    server.close();
  }
}
