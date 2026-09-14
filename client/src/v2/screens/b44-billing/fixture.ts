import type { Board44Data } from "./Screen";

// Verbatim values from the approved render (docs/design/.../19-billing-and-usage.png,
// fragment-47-billing.html). Used only for the preview harness and parity
// tests - the live adapter (data.ts) never renders sample plan names or
// prices; see its header comment.
export const board44Fixture: Board44Data = {
  brandId: "470b15fe-606b-4d96-ab62-69a01e08b237",
  mode: "guided",
  brandName: "VenturePR",
  plan: {
    name: "Team plan",
    description: "Built for growing teams doing credible research and measurement.",
    status: "active",
    nextRenewalAt: "2026-10-12",
    monthlyPriceCents: 29900,
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
  },
  paymentMethodNote: "•••• 4242, expires 08/2028",
  usage: {
    periodDays: 30,
    brands: { used: 3, limit: 5 },
    trackedQuestions: { used: 312, limit: 500 },
    citationRuns: { used: 312, limit: null },
    contentGenerated: { used: 4, limit: 5 },
  },
  invoices: [
    {
      id: "in_1",
      dateIso: "2026-09-12",
      number: "VC-2026-09-001",
      description: "Team plan (Sep 12 – Oct 12, 2026)",
      amountCents: 29900,
      status: "paid",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/1",
      invoicePdf: "https://invoice.stripe.com/i/1.pdf",
    },
    {
      id: "in_2",
      dateIso: "2026-08-12",
      number: "VC-2026-08-001",
      description: "Team plan (Aug 12 – Sep 12, 2026)",
      amountCents: 29900,
      status: "paid",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/2",
      invoicePdf: "https://invoice.stripe.com/i/2.pdf",
    },
  ],
  billingContact: { name: "Jordan Diaz", email: "jordan@venturepr.com" },
  retentionDays: 30,
};
