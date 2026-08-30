// Running a deployed environment on Stripe test keys is deliberate and
// temporary - it is the only way to click the payment flow through with
// Stripe's test cards, which the live API rejects outright.
//
// What makes it dangerous is that it is SILENT. On test keys every checkout
// succeeds, entitlements are granted, and no money moves; nothing anywhere
// looks wrong. These guards are what keep the state visible, and therefore
// temporary.
//
// A source-text version of this file used to grep server/stripeClient.ts,
// server/routes/billing.ts and server/setupProducts.ts for literal
// substrings ("sk_test_", "testMode: isStripeTestMode()", "STRIPE IS IN TEST
// MODE"). None of that proves detection actually classifies a key correctly,
// that the route actually returns the flag, or that the boot warning
// actually fires only in production - it only proves certain tokens exist
// somewhere in the file. These tests instead call the real detection
// function, hit the real route, and run the real boot-time check.
//
// The TestModeBanner component itself is covered in
// tests/unit/stripeTestModeBannerComponent.test.tsx (happy-dom) - it cannot
// share this file's environment because importing server/routes/billing.ts
// here constructs a real OpenAI client at import time, which refuses to run
// under happy-dom. The two places TestModeBanner is actually mounted
// (AppShell, the pricing page) are covered in
// tests/unit/stripeTestModeBannerMounted.test.tsx, which needs
// @/components/TrialGate mocked to a marker component and so cannot share
// either of the other two files' module mocks.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

const productsRouteStubs = vi.hoisted(() => ({
  productsList: vi.fn(),
  pricesList: vi.fn(),
  isStripeTestMode: vi.fn(),
}));

const setupProductsStubs = vi.hoisted(() => ({
  isStripeTestMode: vi.fn(),
  getStripeClient: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));

describe("isStripeTestMode - detection", () => {
  const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY;

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY;
    vi.resetModules();
  });

  it("is true for a test secret key", async () => {
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = "sk_test_abc123";
    const { isStripeTestMode } = await import("../../server/stripeClient");
    expect(isStripeTestMode()).toBe(true);
  });

  it("is false for a live secret key", async () => {
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = "sk_live_abc123";
    const { isStripeTestMode } = await import("../../server/stripeClient");
    expect(isStripeTestMode()).toBe(false);
  });

  it("is false when no key is configured at all", async () => {
    vi.resetModules();
    delete process.env.STRIPE_SECRET_KEY;
    const { isStripeTestMode } = await import("../../server/stripeClient");
    expect(isStripeTestMode()).toBe(false);
  });
});

describe("GET /api/stripe/products - rides the test-mode flag on the catalogue the UI already fetches", () => {
  const stubs = productsRouteStubs;

  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY ??= "test-key";
    process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
    process.env.STRIPE_SECRET_KEY ??= "sk_test_xxx";
    stubs.productsList.mockReset().mockResolvedValue({ data: [] });
    stubs.pricesList.mockReset().mockResolvedValue({ data: [] });
    stubs.isStripeTestMode.mockReset();

    vi.doMock("../../server/stripeClient", () => ({
      getStripeClient: () => ({
        products: { list: stubs.productsList },
        prices: { list: stubs.pricesList },
      }),
      getUncachableStripeClient: async () => ({}),
      getStripePublishableKey: async () => "pk_test_x",
      isStripeTestMode: stubs.isStripeTestMode,
    }));
    vi.doMock("../../server/lib/logger", () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
    vi.doMock("../../server/auth", () => ({
      isAuthenticated: (
        _req: express.Request,
        _res: express.Response,
        next: express.NextFunction,
      ) => next(),
    }));
  });

  async function fetchProducts(): Promise<{ status: number; body: any }> {
    const { setupBillingRoutes } = await import("../../server/routes/billing");
    const app = express();
    setupBillingRoutes(app);
    const server = app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("server did not start");
      const res = await fetch(`http://127.0.0.1:${address.port}/api/stripe/products`);
      return { status: res.status, body: await res.json() };
    } finally {
      server.close();
    }
  }

  it("reports testMode: true on Stripe test keys", async () => {
    stubs.isStripeTestMode.mockReturnValue(true);
    const { body } = await fetchProducts();
    expect(body.testMode).toBe(true);
  });

  it("reports testMode: false on live keys", async () => {
    stubs.isStripeTestMode.mockReturnValue(false);
    const { body } = await fetchProducts();
    expect(body.testMode).toBe(false);
  });
});

describe("setupStripeProducts - boot-time warning", () => {
  const setupStubs = setupProductsStubs;

  beforeEach(() => {
    vi.resetModules();
    setupStubs.isStripeTestMode.mockReset();
    setupStubs.getStripeClient.mockReset();
    setupStubs.warn.mockReset();
    setupStubs.info.mockReset();
    vi.stubEnv("STRIPE_PRODUCT_SYNC", "");
    vi.doMock("../../server/stripeClient", () => ({
      getStripeClient: setupStubs.getStripeClient,
      isStripeTestMode: setupStubs.isStripeTestMode,
    }));
    vi.doMock("../../server/lib/logger", () => ({
      logger: { warn: setupStubs.warn, info: setupStubs.info, error: vi.fn(), debug: vi.fn() },
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("warns loudly when a production build is running on test keys", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setupStubs.isStripeTestMode.mockReturnValue(true);
    const { setupStripeProducts } = await import("../../server/setupProducts");

    await setupStripeProducts();

    expect(setupStubs.warn).toHaveBeenCalledWith(expect.stringContaining("STRIPE IS IN TEST MODE"));
    // Product sync is off in this test (STRIPE_PRODUCT_SYNC unset), so the
    // warning must have come from the test-mode check alone, not from a
    // real Stripe call.
    expect(setupStubs.getStripeClient).not.toHaveBeenCalled();
  });

  it("stays quiet in production on live keys", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setupStubs.isStripeTestMode.mockReturnValue(false);
    const { setupStripeProducts } = await import("../../server/setupProducts");

    await setupStripeProducts();

    expect(setupStubs.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("STRIPE IS IN TEST MODE"),
    );
  });

  it("stays quiet outside production even on test keys - dev is expected to use them", async () => {
    vi.stubEnv("NODE_ENV", "development");
    setupStubs.isStripeTestMode.mockReturnValue(true);
    const { setupStripeProducts } = await import("../../server/setupProducts");

    await setupStripeProducts();

    expect(setupStubs.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("STRIPE IS IN TEST MODE"),
    );
  });
});
