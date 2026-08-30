// Direct, no-HTTP tests for server/services/billing.ts
// (phase B7-15 service extraction).
//
// Covers only the three routes that could be safely pulled out of
// server/routes/billing.ts: GET /api/stripe/products, POST
// /api/billing/portal-session, and GET /api/billing/invoices. The checkout,
// subscription-status, cancel, and resume routes stay in the route file - see
// server/services/billing.ts's header comment for why.

import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.STRIPE_SECRET_KEY ??= "sk_test_xxx";

const stubs = vi.hoisted(() => ({
  productsList: vi.fn(),
  pricesList: vi.fn(),
  portalCreate: vi.fn(),
  invoicesList: vi.fn(),
}));

vi.mock("../../server/stripeClient", () => ({
  getStripeClient: () => ({
    products: { list: stubs.productsList },
    prices: { list: stubs.pricesList },
    invoices: { list: stubs.invoicesList },
  }),
  getUncachableStripeClient: async () => ({
    billingPortal: { sessions: { create: stubs.portalCreate } },
  }),
}));

const { getStripeProductCatalog, createBillingPortalSession, listBillingInvoices } =
  await import("../../server/services/billing");

beforeEach(() => {
  for (const stub of Object.values(stubs)) stub.mockReset();
});

describe("getStripeProductCatalog", () => {
  it("merges prices onto their product and drops products without a tier", async () => {
    stubs.productsList.mockResolvedValueOnce({
      data: [
        { id: "prod_pro", name: "Pro", description: "d", metadata: { tier: "pro" } },
        { id: "prod_notier", name: "No tier", description: null, metadata: {} },
      ],
    });
    stubs.pricesList.mockResolvedValueOnce({
      data: [
        {
          id: "price_pro",
          unit_amount: 9900,
          currency: "usd",
          recurring: { interval: "month" },
          product: "prod_pro",
        },
        {
          id: "price_notier",
          unit_amount: 100,
          currency: "usd",
          recurring: null,
          product: "prod_notier",
        },
      ],
    });

    const catalog = await getStripeProductCatalog();

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      id: "prod_pro",
      prices: [{ id: "price_pro", unit_amount: 9900 }],
    });
  });

  it("sorts ascending by the first price's unit_amount", async () => {
    stubs.productsList.mockResolvedValueOnce({
      data: [
        { id: "prod_agency", name: "Agency", description: null, metadata: { tier: "agency" } },
        { id: "prod_pro", name: "Pro", description: null, metadata: { tier: "pro" } },
      ],
    });
    stubs.pricesList.mockResolvedValueOnce({
      data: [
        {
          id: "price_agency",
          unit_amount: 29900,
          currency: "usd",
          recurring: {},
          product: "prod_agency",
        },
        { id: "price_pro", unit_amount: 9900, currency: "usd", recurring: {}, product: "prod_pro" },
      ],
    });

    const catalog = await getStripeProductCatalog();

    expect(catalog.map((p) => p.id)).toEqual(["prod_pro", "prod_agency"]);
  });
});

describe("createBillingPortalSession", () => {
  it("passes the customer id and return url straight through to Stripe", async () => {
    stubs.portalCreate.mockResolvedValueOnce({ url: "https://billing.stripe.com/session/abc" });

    const result = await createBillingPortalSession("cus_123", "https://app.test/settings");

    expect(stubs.portalCreate).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "https://app.test/settings",
    });
    expect(result).toEqual({ url: "https://billing.stripe.com/session/abc" });
  });
});

describe("listBillingInvoices", () => {
  it("filters out drafts and maps to the table's field set", async () => {
    stubs.invoicesList.mockResolvedValueOnce({
      data: [
        {
          id: "in_1",
          number: "INV-1",
          status: "paid",
          amount_paid: 9900,
          amount_due: 0,
          currency: "usd",
          created: 1700000000,
          hosted_invoice_url: "https://stripe.test/inv1",
          invoice_pdf: "https://stripe.test/inv1.pdf",
        },
        {
          id: "in_2",
          number: null,
          status: "draft",
          amount_paid: 0,
          amount_due: 9900,
          currency: "usd",
          created: 1700000100,
          hosted_invoice_url: null,
          invoice_pdf: null,
        },
      ],
    });

    const invoices = await listBillingInvoices("cus_123");

    expect(stubs.invoicesList).toHaveBeenCalledWith({ customer: "cus_123", limit: 24 });
    expect(invoices).toEqual([
      {
        id: "in_1",
        number: "INV-1",
        status: "paid",
        amountPaid: 9900,
        amountDue: 0,
        currency: "usd",
        created: 1700000000,
        hostedInvoiceUrl: "https://stripe.test/inv1",
        invoicePdf: "https://stripe.test/inv1.pdf",
      },
    ]);
  });
});
