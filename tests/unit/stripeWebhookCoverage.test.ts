// Behavioural guards for the Stripe webhook surface (server/webhookHandlers.ts).
//
// A source-text version of this file used to read the file's raw text and
// grep for strings like "await lease.assertOwned()" or a `case "..."` label.
// That protects against nothing a mutation couldn't dodge with a comment or
// a cosmetic rename, and tests/unit/schedulerOrchestratorParity.test.ts's own
// sibling in the cron domain proved the failure mode directly: a comment
// that merely mentioned an orchestrator step name broke an equivalent
// text-matching test with the step's actual behavior untouched.
//
// These tests instead call the real WebhookHandlers.processWebhook with a
// mocked Stripe client, storage layer and claim table - the same harness
// tests/unit/stripeSubscriptionDeleted.test.ts already uses for
// customer.subscription.deleted - and assert on what actually happens: what
// gets written to storage, what email goes out, and whether the event is
// left retryable.
//
// Each invariant here is a bug that actually shipped:
//   - a swallowed error let a customer pay and never get their tier
//   - a decline and an SCA prompt were treated as the same thing
//   - a dispute or a finalization failure fell into the same silent bucket
//     as payment_intent.created
//   - the ownership lease could be lost mid-handler and the write still land
//
// The checkout duplicate-subscription guard (routes/billing.ts) and its
// idempotency key are exercised in tests/unit/billingCheckoutSafety.test.ts
// and tests/unit/billingSubscriptionGuards.test.ts, not duplicated here.

import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

const stubs = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  subscriptionsRetrieve: vi.fn(),
  subscriptionsList: vi.fn(),
  invoicesRetrieve: vi.fn(),
  getUserByStripeCustomerId: vi.fn(),
  updateUserStripeInfo: vi.fn(),
  logSystemAudit: vi.fn(),
  captureAndFlush: vi.fn(),
  sendPaymentFailedEmail: vi.fn(),
  sendPaymentActionRequiredEmail: vi.fn(),
  sendTrialEndingEmail: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  assertOwned: vi.fn(async () => undefined),
  leaseFinish: vi.fn(async () => true),
  leaseStop: vi.fn(async () => undefined),
}));

vi.mock("../../server/stripeClient", () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: stubs.constructEvent },
    subscriptions: { retrieve: stubs.subscriptionsRetrieve, list: stubs.subscriptionsList },
    invoices: { retrieve: stubs.invoicesRetrieve },
  }),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getUserByStripeCustomerId: stubs.getUserByStripeCustomerId,
    updateUserStripeInfo: stubs.updateUserStripeInfo,
  },
}));

vi.mock("../../server/lib/audit", () => ({ logSystemAudit: stubs.logSystemAudit }));
vi.mock("../../server/lib/stripeWebhookClaim", () => ({
  claimStripeWebhookEvent: vi.fn(async () => ({ kind: "claimed", token: "claim-token" })),
  maintainStripeWebhookClaim: () => ({
    assertOwned: stubs.assertOwned,
    finish: stubs.leaseFinish,
    stop: stubs.leaseStop,
  }),
}));
vi.mock("../../server/lib/logger", () => ({ logger: stubs.logger }));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: stubs.captureAndFlush }));
vi.mock("../../server/lib/billingEmails", () => ({
  sendPaymentFailedEmail: stubs.sendPaymentFailedEmail,
  sendPaymentActionRequiredEmail: stubs.sendPaymentActionRequiredEmail,
  sendTrialEndingEmail: stubs.sendTrialEndingEmail,
}));

const { WebhookHandlers } = await import("../../server/webhookHandlers");

async function processEvent(event: unknown): Promise<void> {
  stubs.constructEvent.mockReturnValue(event);
  await WebhookHandlers.processWebhook(Buffer.from("event"), "signature");
}

function proProduct(overrides: Record<string, unknown> = {}) {
  return { id: "prod_pro", metadata: { tier: "pro" }, ...overrides };
}

function checkoutCompletedEvent(opts: {
  userId?: string | null;
  customer?: string;
  subscription?: string;
  id?: string;
}) {
  return {
    id: opts.id ?? "evt_checkout",
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: opts.userId === undefined ? "user_1" : opts.userId,
        customer: opts.customer ?? "cus_1",
        subscription: opts.subscription ?? "sub_1",
      },
    },
  };
}

function subscriptionUpdatedEvent(opts: {
  status: string;
  customer?: string;
  trial_end?: number | null;
  id?: string;
}) {
  return {
    id: opts.id ?? "evt_sub_updated",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_1",
        customer: opts.customer ?? "cus_1",
        status: opts.status,
        trial_end: opts.trial_end ?? null,
      },
    },
  };
}

function invoicePaidEvent(opts: { subscription?: string; customer?: string; id?: string }) {
  return {
    id: opts.id ?? "evt_invoice_paid",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_1",
        subscription: opts.subscription ?? "sub_1",
        customer: opts.customer ?? "cus_1",
      },
    },
  };
}

function invoicePaymentFailedEvent(opts: {
  customer?: string;
  customer_email?: string | null;
  attempt_count?: number;
  id?: string;
}) {
  return {
    id: opts.id ?? "evt_payment_failed",
    type: "invoice.payment_failed",
    data: {
      object: {
        id: "in_failed",
        customer: opts.customer ?? "cus_1",
        customer_email: opts.customer_email ?? "buyer@example.test",
        attempt_count: opts.attempt_count ?? 1,
        amount_due: 9900,
        currency: "usd",
        hosted_invoice_url: "https://stripe.test/invoice",
      },
    },
  };
}

function invoicePaymentActionRequiredEvent(opts: { customer?: string; id?: string }) {
  return {
    id: opts.id ?? "evt_action_required",
    type: "invoice.payment_action_required",
    data: {
      object: {
        id: "in_sca",
        customer: opts.customer ?? "cus_1",
        customer_email: "buyer@example.test",
        hosted_invoice_url: "https://stripe.test/invoice",
      },
    },
  };
}

function chargeDisputeCreatedEvent(opts: { id?: string } = {}) {
  return {
    id: opts.id ?? "evt_dispute",
    type: "charge.dispute.created",
    data: { object: { id: "dp_1", amount: 9900, reason: "fraudulent" } },
  };
}

function invoiceFinalizationFailedEvent(opts: { id?: string } = {}) {
  return {
    id: opts.id ?? "evt_finalization_failed",
    type: "invoice.finalization_failed",
    data: { object: { id: "in_bad", customer: "cus_1" } },
  };
}

function subscriptionDeletedEvent(opts: { id?: string } = {}) {
  return {
    id: opts.id ?? "evt_sub_deleted",
    type: "customer.subscription.deleted",
    data: { object: { id: "sub_deleted", customer: "cus_1" } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.assertOwned.mockImplementation(async () => undefined);
  stubs.leaseFinish.mockImplementation(async () => true);
  stubs.leaseStop.mockImplementation(async () => undefined);

  stubs.getUserByStripeCustomerId.mockResolvedValue({
    id: "user_1",
    email: "buyer@example.test",
    accessTier: "pro",
    stripeSubscriptionId: "sub_1",
  });
  stubs.updateUserStripeInfo.mockResolvedValue(undefined);
  stubs.subscriptionsRetrieve.mockResolvedValue({
    id: "sub_1",
    status: "active",
    trial_end: null,
    items: { data: [{ price: { product: proProduct() } }] },
  });
  stubs.subscriptionsList.mockResolvedValue({ data: [] });
  stubs.invoicesRetrieve.mockResolvedValue({ payments: { data: [] } });
});

describe("every billing-critical event is actually handled", () => {
  // Each of these used to be reachable only through the default `case`,
  // which just logs a warning and does nothing - the same bucket as
  // payment_intent.created. If a case were ever dropped from the switch,
  // this is the log line that would appear instead of the real handler
  // running.
  const UNHANDLED_WARNING = "stripe: unhandled webhook event type";

  it.each([
    ["checkout.session.completed", () => checkoutCompletedEvent({})],
    ["invoice.paid", () => invoicePaidEvent({})],
    ["customer.subscription.updated", () => subscriptionUpdatedEvent({ status: "active" })],
    ["customer.subscription.deleted", () => subscriptionDeletedEvent()],
    ["invoice.payment_failed", () => invoicePaymentFailedEvent({})],
    ["invoice.payment_action_required", () => invoicePaymentActionRequiredEvent({})],
    ["charge.dispute.created", () => chargeDisputeCreatedEvent()],
    ["invoice.finalization_failed", () => invoiceFinalizationFailedEvent()],
  ])("%s does not fall through to the unhandled-event bucket", async (_type, makeEvent) => {
    await processEvent(makeEvent());

    expect(stubs.logger.warn).not.toHaveBeenCalledWith(expect.anything(), UNHANDLED_WARNING);
  });
});

describe("ownership lease gates the money-moving writes", () => {
  it("never runs any handler once the claim is lost, for any event type", async () => {
    stubs.assertOwned.mockRejectedValue(new Error("lost the processing claim"));

    for (const event of [
      checkoutCompletedEvent({}),
      subscriptionUpdatedEvent({ status: "active" }),
      invoicePaidEvent({}),
      invoicePaymentFailedEvent({}),
      invoicePaymentActionRequiredEvent({}),
      chargeDisputeCreatedEvent(),
      invoiceFinalizationFailedEvent(),
      subscriptionDeletedEvent(),
    ]) {
      await expect(processEvent(event)).rejects.toThrow();
    }

    expect(stubs.updateUserStripeInfo).not.toHaveBeenCalled();
    expect(stubs.sendPaymentFailedEmail).not.toHaveBeenCalled();
    expect(stubs.sendPaymentActionRequiredEmail).not.toHaveBeenCalled();
    expect(stubs.captureAndFlush).not.toHaveBeenCalled();
  });

  it("re-checks ownership right before granting the tier, not only at the top of the handler", async () => {
    // First call (entering the try block) succeeds; the second - right
    // before storage.updateUserStripeInfo - is where a lease lost mid-flight
    // (another worker picked up the same event after a stalled renewal) must
    // stop the write from landing.
    let calls = 0;
    stubs.assertOwned.mockImplementation(async () => {
      calls += 1;
      if (calls >= 2) throw new Error("lost the processing claim");
    });

    await expect(processEvent(checkoutCompletedEvent({}))).rejects.toThrow(
      /lost the processing claim/,
    );

    expect(stubs.updateUserStripeInfo).not.toHaveBeenCalled();
    expect(stubs.leaseStop).toHaveBeenCalled();
  });
});

describe("checkout.session.completed", () => {
  it("rethrows when the tier lookup fails, so Stripe retries the event", async () => {
    // Swallowing this let execution reach the point where the event is
    // marked complete, which stops Stripe from ever redelivering it - the
    // customer had paid and nothing left in the system could grant their
    // tier.
    stubs.subscriptionsRetrieve.mockRejectedValue(new Error("Stripe is down"));

    await expect(processEvent(checkoutCompletedEvent({}))).rejects.toThrow("Stripe is down");

    expect(stubs.updateUserStripeInfo).not.toHaveBeenCalled();
    // The event must NOT be marked complete on this path.
    expect(stubs.leaseFinish).not.toHaveBeenCalled();
    expect(stubs.leaseStop).toHaveBeenCalled();
  });

  it("never downgrades a payer when the product carries no usable metadata.tier", async () => {
    stubs.subscriptionsRetrieve.mockResolvedValue({
      id: "sub_1",
      status: "active",
      trial_end: null,
      items: { data: [{ price: { product: proProduct({ metadata: {} }) } }] },
    });

    await processEvent(checkoutCompletedEvent({ userId: "user_1", customer: "cus_1" }));

    expect(stubs.updateUserStripeInfo).toHaveBeenCalledTimes(1);
    const [, updates] = stubs.updateUserStripeInfo.mock.calls[0];
    // Customer/subscription IDs are still recorded - only the tier is
    // withheld, because we cannot tell what plan was paid for.
    expect(updates).not.toHaveProperty("accessTier");
    expect(updates.stripeCustomerId).toBe("cus_1");
    expect(updates.stripeSubscriptionId).toBe("sub_1");
    expect(stubs.captureAndFlush).toHaveBeenCalled();
  });

  it("stamps trial_ends_at from checkout - the only event a brand-new subscriber gets", async () => {
    const trialEnd = 1_900_000_000;
    stubs.subscriptionsRetrieve.mockResolvedValue({
      id: "sub_1",
      status: "trialing",
      trial_end: trialEnd,
      items: { data: [{ price: { product: proProduct() } }] },
    });

    await processEvent(checkoutCompletedEvent({}));

    expect(stubs.updateUserStripeInfo).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({ trialEndsAt: new Date(trialEnd * 1000), accessTier: "pro" }),
    );
  });

  it("clears trial_ends_at when the new subscription is not trialing", async () => {
    stubs.subscriptionsRetrieve.mockResolvedValue({
      id: "sub_1",
      status: "active",
      trial_end: null,
      items: { data: [{ price: { product: proProduct() } }] },
    });

    await processEvent(checkoutCompletedEvent({}));

    expect(stubs.updateUserStripeInfo).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({ trialEndsAt: null }),
    );
  });

  it("does nothing when the session carries no client_reference_id", async () => {
    await processEvent(checkoutCompletedEvent({ userId: null }));

    expect(stubs.updateUserStripeInfo).not.toHaveBeenCalled();
  });
});

describe("customer.subscription.updated - dunning", () => {
  it("keeps a past_due customer entitled to their plan while Stripe retries", async () => {
    await processEvent(subscriptionUpdatedEvent({ status: "past_due" }));

    expect(stubs.updateUserStripeInfo).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({ accessTier: "pro" }),
    );
  });

  it("keeps a trialing customer entitled to the plan they picked", async () => {
    await processEvent(subscriptionUpdatedEvent({ status: "trialing", trial_end: 1_900_000_000 }));

    expect(stubs.updateUserStripeInfo).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({ accessTier: "pro" }),
    );
  });

  it("revokes access (to readonly, not free) once the subscription is genuinely unpaid", async () => {
    // unpaid is the terminal state for the retry window - active, trialing
    // and past_due are the only entitled statuses.
    await processEvent(subscriptionUpdatedEvent({ status: "unpaid" }));

    expect(stubs.updateUserStripeInfo).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({ accessTier: "readonly" }),
    );
  });

  it("never downgrades an entitled subscriber when the product metadata is unusable", async () => {
    stubs.subscriptionsRetrieve.mockResolvedValue({
      id: "sub_1",
      status: "active",
      items: { data: [{ price: { product: proProduct({ metadata: {} }) } }] },
    });

    await processEvent(subscriptionUpdatedEvent({ status: "active" }));

    // previousTier (from getUserByStripeCustomerId, "pro") is carried
    // forward untouched rather than dropped.
    expect(stubs.updateUserStripeInfo).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({ accessTier: "pro" }),
    );
    expect(stubs.captureAndFlush).toHaveBeenCalled();
  });

  it("does nothing for a customer id with no matching user", async () => {
    stubs.getUserByStripeCustomerId.mockResolvedValue(undefined);

    await processEvent(subscriptionUpdatedEvent({ status: "active" }));

    expect(stubs.updateUserStripeInfo).not.toHaveBeenCalled();
  });
});

describe("invoice.paid - renewal reconciliation", () => {
  it("reconciles the tier on renewal without touching an already-correct tier", async () => {
    await processEvent(invoicePaidEvent({}));
    // user.accessTier is already "pro" and the product resolves to "pro" -
    // no redundant write.
    expect(stubs.updateUserStripeInfo).not.toHaveBeenCalled();
  });

  it("updates the tier when a renewal reveals it drifted", async () => {
    stubs.getUserByStripeCustomerId.mockResolvedValue({
      id: "user_1",
      accessTier: "readonly",
      stripeSubscriptionId: "sub_1",
    });

    await processEvent(invoicePaidEvent({}));

    expect(stubs.updateUserStripeInfo).toHaveBeenCalledWith("user_1", { accessTier: "pro" });
  });
});

describe("invoice.payment_failed / invoice.payment_action_required - dunning emails", () => {
  it("does not revoke access on a single failed payment", async () => {
    await processEvent(invoicePaymentFailedEvent({}));

    expect(stubs.updateUserStripeInfo).not.toHaveBeenCalled();
    expect(stubs.sendPaymentFailedEmail).toHaveBeenCalled();
  });

  it("sends the SCA email, not the decline email, when payment requires authentication", async () => {
    stubs.invoicesRetrieve.mockResolvedValue({
      payments: { data: [{ payment: { payment_intent: { status: "requires_action" } } }] },
    });

    await processEvent(invoicePaymentActionRequiredEvent({}));

    expect(stubs.sendPaymentActionRequiredEmail).toHaveBeenCalled();
    expect(stubs.sendPaymentFailedEmail).not.toHaveBeenCalled();
  });

  it("stays quiet on payment_failed for the same attempt payment_action_required already emailed about", async () => {
    stubs.invoicesRetrieve.mockResolvedValue({
      payments: { data: [{ payment: { payment_intent: { status: "requires_action" } } }] },
    });

    await processEvent(invoicePaymentFailedEvent({}));

    expect(stubs.sendPaymentFailedEmail).not.toHaveBeenCalled();
  });

  it("classifies the failure from the payment intent, not a zero attempt count", async () => {
    // attempt_count 0 correlates with SCA today but is not what the
    // distinction means - a real decline on the first attempt must still
    // send the decline email.
    stubs.invoicesRetrieve.mockResolvedValue({
      payments: { data: [{ payment: { payment_intent: { status: "succeeded" } } }] },
    });

    await processEvent(invoicePaymentFailedEvent({ attempt_count: 0 }));

    expect(stubs.sendPaymentFailedEmail).toHaveBeenCalled();
  });

  it("fails open to the decline email when classification itself errors", async () => {
    // Silence on a real decline is worse than a slightly-off message.
    stubs.invoicesRetrieve.mockRejectedValue(new Error("network blip"));

    await processEvent(invoicePaymentFailedEvent({}));

    expect(stubs.sendPaymentFailedEmail).toHaveBeenCalled();
  });
});

describe("charge.dispute.created / invoice.finalization_failed", () => {
  it("reports a dispute rather than dropping it in the unhandled bucket", async () => {
    await processEvent(chargeDisputeCreatedEvent());

    expect(stubs.captureAndFlush).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ source: "stripe-webhook.dispute" }),
      }),
    );
  });

  it("reports a finalization failure rather than dropping it in the unhandled bucket", async () => {
    await processEvent(invoiceFinalizationFailedEvent());

    expect(stubs.captureAndFlush).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ source: "stripe-webhook.finalization" }),
      }),
    );
  });
});
