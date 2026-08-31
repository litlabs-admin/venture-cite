// HTTP-level route contracts for server/routes/billing.ts (Stripe billing).
//
// Money paths: assert exactly what each handler does on service failure and
// success, not what "seems reasonable." isAuthenticated is mocked as a
// pass-through that stamps req.user from a per-test mutable variable, so
// the missing-session branches inside each handler (checked via
// `(req as any).user`, not by the middleware) can be exercised directly.

import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";

let currentUser: { id: string } | null = { id: "11111111-1111-4111-8111-111111111111" };

const { storageMock, billingMock, stripeClientMock } = vi.hoisted(() => ({
  storageMock: { getUser: vi.fn() },
  billingMock: {
    getStripeProductCatalog: vi.fn(),
    createBillingPortalSession: vi.fn(),
    listBillingInvoices: vi.fn(),
    appUrl: vi.fn((path: string) => `https://app.test${path}`),
    createCheckoutSession: vi.fn(),
    getSubscriptionSnapshot: vi.fn(),
    cancelSubscriptionForCustomer: vi.fn(),
    resumeSubscriptionForCustomer: vi.fn(),
  },
  stripeClientMock: {
    getStripePublishableKey: vi.fn(),
    isStripeTestMode: vi.fn(),
  },
}));

vi.mock("../../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../../server/storage", () => ({ storage: storageMock }));
vi.mock("../../server/services/billing", () => billingMock);
vi.mock("../../server/stripeClient", () => stripeClientMock);
vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: any, _res: unknown, next: () => void) => {
    req.user = currentUser;
    next();
  },
}));
vi.mock("../../server/lib/routesShared", () => ({
  asyncHandler: (handler: unknown) => handler,
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));

const { setupBillingRoutes } = await import("../../server/routes/billing");

function makeApp() {
  const app = express();
  app.use(express.json());
  // The route handlers themselves read `(req as any).user`; unauthenticated
  // callers are simulated by clearing currentUser before the request.
  app.use((req: any, _res, next) => {
    req.user = currentUser;
    next();
  });
  setupBillingRoutes(app);
  return app;
}

describe("billing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = { id: "11111111-1111-4111-8111-111111111111" };
  });

  describe("POST /api/billing/portal-session", () => {
    it("answers 400 when the user has no Stripe customer on file", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: null });

      const response = await request(makeApp()).post("/api/billing/portal-session");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: "No billing account on file. Subscribe to a plan first.",
      });
      expect(billingMock.createBillingPortalSession).not.toHaveBeenCalled();
    });

    it("answers 502 (never leaking the Stripe error) when portal creation throws", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: "cus_1" });
      billingMock.createBillingPortalSession.mockRejectedValue(new Error("stripe is down"));

      const response = await request(makeApp()).post("/api/billing/portal-session");

      expect(response.status).toBe(502);
      expect(response.body).toEqual({
        success: false,
        error: "Billing portal temporarily unavailable",
      });
    });

    it("returns the portal URL on success", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: "cus_1" });
      billingMock.createBillingPortalSession.mockResolvedValue({
        url: "https://billing.stripe.com/p/1",
      });

      const response = await request(makeApp()).post("/api/billing/portal-session");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, url: "https://billing.stripe.com/p/1" });
      expect(billingMock.createBillingPortalSession).toHaveBeenCalledWith(
        "cus_1",
        "https://app.test/settings",
      );
    });
  });

  describe("GET /api/stripe/publishable-key", () => {
    it("degrades to success:false (still HTTP 200) when the key lookup throws", async () => {
      stripeClientMock.getStripePublishableKey.mockRejectedValue(new Error("boom"));

      const response = await request(makeApp()).get("/api/stripe/publishable-key");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: false,
        error: "Unable to load billing configuration",
      });
    });

    it("returns the publishable key on success", async () => {
      stripeClientMock.getStripePublishableKey.mockResolvedValue("pk_test_123");

      const response = await request(makeApp()).get("/api/stripe/publishable-key");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, publishableKey: "pk_test_123" });
    });
  });

  describe("GET /api/stripe/products", () => {
    it("degrades to an empty product list (still 200/success:true) when Stripe errors", async () => {
      billingMock.getStripeProductCatalog.mockRejectedValue(new Error("stripe down"));

      const response = await request(makeApp()).get("/api/stripe/products");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: [] });
    });

    it("returns the catalog with testMode alongside it", async () => {
      billingMock.getStripeProductCatalog.mockResolvedValue([{ id: "prod_1" }]);
      stripeClientMock.isStripeTestMode.mockReturnValue(true);

      const response = await request(makeApp()).get("/api/stripe/products");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: [{ id: "prod_1" }], testMode: true });
    });
  });

  describe("POST /api/stripe/checkout", () => {
    it("answers 401 when there is no authenticated session", async () => {
      currentUser = null;

      const response = await request(makeApp())
        .post("/api/stripe/checkout")
        .send({ priceId: "price_123" });

      expect(response.status).toBe(401);
      expect(billingMock.createCheckoutSession).not.toHaveBeenCalled();
    });

    it("answers 400 when priceId is missing", async () => {
      const response = await request(makeApp()).post("/api/stripe/checkout").send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "priceId is required" });
    });

    it("answers 400 for a priceId that doesn't look like a Stripe price id", async () => {
      const response = await request(makeApp())
        .post("/api/stripe/checkout")
        .send({ priceId: "not-a-price" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "Invalid price ID format" });
      expect(billingMock.createCheckoutSession).not.toHaveBeenCalled();
    });

    it.each([
      ["invalid-price", 400, { success: false, error: "Invalid or inactive price" }],
      ["already-subscribed", 400, { success: false, error: "You're already on this plan." }],
    ])("maps outcome.kind=%s to %i", async (kind, status, body) => {
      billingMock.createCheckoutSession.mockResolvedValue({ kind });

      const response = await request(makeApp())
        .post("/api/stripe/checkout")
        .send({ priceId: "price_123" });

      expect(response.status).toBe(status);
      expect(response.body).toEqual(body);
    });

    it("answers success:true, updated:true for an in-place plan switch (no redirect)", async () => {
      billingMock.createCheckoutSession.mockResolvedValue({ kind: "switched" });

      const response = await request(makeApp())
        .post("/api/stripe/checkout")
        .send({ priceId: "price_123" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, updated: true });
    });

    it("returns the checkout session URL for a new subscription", async () => {
      billingMock.createCheckoutSession.mockResolvedValue({
        kind: "session",
        url: "https://checkout.stripe.com/pay/123",
      });

      const response = await request(makeApp())
        .post("/api/stripe/checkout")
        .send({ priceId: "price_123" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        url: "https://checkout.stripe.com/pay/123",
      });
    });

    it("answers 500 without leaking the Stripe error message when the service throws", async () => {
      billingMock.createCheckoutSession.mockRejectedValue(new Error("card_declined: 4242..."));

      const response = await request(makeApp())
        .post("/api/stripe/checkout")
        .send({ priceId: "price_123" });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: "Failed to create checkout session",
      });
    });
  });

  describe("GET /api/billing/subscription", () => {
    it("returns data:null (not an error) when the user never subscribed", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: null });

      const response = await request(makeApp()).get("/api/billing/subscription");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: null });
      expect(billingMock.getSubscriptionSnapshot).not.toHaveBeenCalled();
    });

    it("answers 502 when Stripe can't be reached", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: "cus_1" });
      billingMock.getSubscriptionSnapshot.mockRejectedValue(new Error("network"));

      const response = await request(makeApp()).get("/api/billing/subscription");

      expect(response.status).toBe(502);
      expect(response.body).toEqual({
        success: false,
        error: "Could not load your subscription",
      });
    });

    it("returns the subscription snapshot on success", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: "cus_1" });
      billingMock.getSubscriptionSnapshot.mockResolvedValue({ plan: "pro", renewsAt: 123 });

      const response = await request(makeApp()).get("/api/billing/subscription");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { plan: "pro", renewsAt: 123 } });
    });
  });

  describe("POST /api/billing/cancel", () => {
    it("answers 400 when there is no Stripe customer on file", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: null });

      const response = await request(makeApp()).post("/api/billing/cancel");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "No subscription to cancel." });
    });

    it("answers 400 when the service finds nothing to cancel", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: "cus_1" });
      billingMock.cancelSubscriptionForCustomer.mockResolvedValue(null);

      const response = await request(makeApp()).post("/api/billing/cancel");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "No active subscription." });
    });

    it("cancels at period end and returns endsAt - it never deletes immediately", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: "cus_1" });
      billingMock.cancelSubscriptionForCustomer.mockResolvedValue({ endsAt: 1234567890 });

      const response = await request(makeApp()).post("/api/billing/cancel");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { cancelAtPeriodEnd: true, endsAt: 1234567890 },
      });
      expect(billingMock.cancelSubscriptionForCustomer).toHaveBeenCalledWith(
        "cus_1",
        currentUser!.id,
      );
    });

    it("answers 502 when Stripe rejects the cancellation", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: "cus_1" });
      billingMock.cancelSubscriptionForCustomer.mockRejectedValue(new Error("stripe error"));

      const response = await request(makeApp()).post("/api/billing/cancel");

      expect(response.status).toBe(502);
      expect(response.body).toEqual({ success: false, error: "Could not cancel right now" });
    });
  });

  describe("POST /api/billing/resume", () => {
    it("answers 400 when there is no Stripe customer on file", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: null });

      const response = await request(makeApp()).post("/api/billing/resume");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: "No subscription found." });
    });

    it("answers 400 when the subscription is not currently cancelling", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: "cus_1" });
      billingMock.resumeSubscriptionForCustomer.mockResolvedValue(null);

      const response = await request(makeApp()).post("/api/billing/resume");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: "Nothing to resume - this plan is not cancelling.",
      });
    });

    it("resumes on success", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: "cus_1" });
      billingMock.resumeSubscriptionForCustomer.mockResolvedValue({ resumed: true });

      const response = await request(makeApp()).post("/api/billing/resume");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
    });
  });

  describe("GET /api/billing/invoices", () => {
    it("returns an empty list (not an error) with no Stripe customer on file", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: null });

      const response = await request(makeApp()).get("/api/billing/invoices");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: [] });
      expect(billingMock.listBillingInvoices).not.toHaveBeenCalled();
    });

    it("answers 502 when Stripe can't list invoices", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: "cus_1" });
      billingMock.listBillingInvoices.mockRejectedValue(new Error("network"));

      const response = await request(makeApp()).get("/api/billing/invoices");

      expect(response.status).toBe(502);
      expect(response.body).toEqual({ success: false, error: "Could not load invoices" });
    });

    it("returns invoices on success", async () => {
      storageMock.getUser.mockResolvedValue({ id: currentUser!.id, stripeCustomerId: "cus_1" });
      billingMock.listBillingInvoices.mockResolvedValue([{ id: "in_1", amountDue: 2000 }]);

      const response = await request(makeApp()).get("/api/billing/invoices");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: [{ id: "in_1", amountDue: 2000 }] });
    });
  });
});
