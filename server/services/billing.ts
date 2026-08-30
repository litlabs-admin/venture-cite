// Billing business logic extracted from server/routes/billing.ts
// (phase B7-15). Pure functions: explicit parameters in, plain data out or
// throws. No Express types, no req/res.
//
// The checkout, subscription-status, cancel, and resume routes are NOT
// represented here. tests/unit/billingSubscriptionGuards.test.ts,
// tests/unit/stripeTestModeBanner.test.ts, tests/unit/stripeWebhookCoverage.test.ts,
// and tests/unit/planBeforeBrandGate.test.ts assert directly against the raw
// source text of server/routes/billing.ts (specific substrings, function
// bodies, and route-handler spans covering nearly the entirety of those four
// routes). Moving that logic out would remove the asserted text without
// changing behavior, and per the task's own rule a test that needs editing to
// go green means the change altered behavior - so those four routes stay in
// the route file untouched. See B7-15's report for the line-by-line mapping.

export type StripePriceSummary = {
  id: string;
  unit_amount: number | null;
  currency: string;
  recurring: unknown;
};

export type StripeProductSummary = {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, string>;
  prices: StripePriceSummary[];
};

// Stripe products and prices, merged and sorted for the pricing page.
export async function getStripeProductCatalog(): Promise<StripeProductSummary[]> {
  const { getStripeClient } = await import("../stripeClient");
  const stripe = getStripeClient();

  const [productsResult, pricesResult] = await Promise.all([
    stripe.products.list({ limit: 100, active: true }),
    stripe.prices.list({ limit: 100, active: true }),
  ]);

  const validProducts = productsResult.data.filter((p: any) => p.metadata?.tier);
  const productsMap = new Map<string, any>();

  for (const product of validProducts) {
    productsMap.set(product.id, {
      id: product.id,
      name: product.name,
      description: product.description,
      metadata: product.metadata,
      prices: [],
    });
  }

  for (const price of pricesResult.data) {
    const productId = typeof price.product === "string" ? price.product : (price.product as any).id;
    if (productsMap.has(productId)) {
      productsMap.get(productId).prices.push({
        id: price.id,
        unit_amount: price.unit_amount,
        currency: price.currency,
        recurring: price.recurring,
      });
    }
  }

  return Array.from(productsMap.values()).sort(
    (a, b) => (a.prices[0]?.unit_amount ?? 0) - (b.prices[0]?.unit_amount ?? 0),
  );
}

// Open a Stripe customer-portal session for an already-resolved customer id
// and return URL.
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<{ url: string | null }> {
  const { getUncachableStripeClient } = await import("../stripeClient");
  const stripe = await getUncachableStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

export type BillingInvoiceSummary = {
  id: string;
  number: string | null;
  status: string | null;
  amountPaid: number;
  amountDue: number;
  currency: string;
  created: number;
  hostedInvoiceUrl: string | null | undefined;
  invoicePdf: string | null | undefined;
};

// Read-only invoice list for the Settings panel. Only the fields the table
// renders are returned - a raw Stripe invoice carries far more than a
// billing table needs.
export async function listBillingInvoices(customerId: string): Promise<BillingInvoiceSummary[]> {
  const { getStripeClient } = await import("../stripeClient");
  const stripe = getStripeClient();
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit: 24,
  });
  return (
    invoices.data
      // A draft is not a bill anyone owes yet; listing one reads as a
      // surprise charge.
      .filter((inv) => inv.status && inv.status !== "draft")
      .map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amountPaid: inv.amount_paid,
        amountDue: inv.amount_due,
        currency: inv.currency,
        created: inv.created,
        hostedInvoiceUrl: inv.hosted_invoice_url,
        invoicePdf: inv.invoice_pdf,
      }))
  );
}
