import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

const stubs = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  subscriptionsList: vi.fn(),
  getUserByStripeCustomerId: vi.fn(),
  updateUserStripeInfo: vi.fn(),
  logSystemAudit: vi.fn(),
  finish: vi.fn(async () => true),
}));

vi.mock("../../server/stripeClient", () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: stubs.constructEvent },
    subscriptions: { list: stubs.subscriptionsList },
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
    assertOwned: vi.fn(async () => undefined),
    finish: stubs.finish,
    stop: vi.fn(async () => undefined),
  }),
}));
vi.mock("../../server/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../server/lib/sentryReport", () => ({ captureAndFlush: vi.fn() }));
vi.mock("../../server/lib/billingEmails", () => ({
  sendPaymentFailedEmail: vi.fn(),
  sendPaymentActionRequiredEmail: vi.fn(),
  sendTrialEndingEmail: vi.fn(),
}));

const { WebhookHandlers } = await import("../../server/webhookHandlers");

function deletedEvent(subscriptionId = "sub_deleted") {
  return {
    id: "evt_deleted",
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: subscriptionId,
        customer: "cus_123",
      },
    },
  };
}

async function processDeletedSubscription(): Promise<void> {
  await WebhookHandlers.processWebhook(Buffer.from("event"), "signature");
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.constructEvent.mockReturnValue(deletedEvent());
  stubs.getUserByStripeCustomerId.mockResolvedValue({
    id: "user_123",
    accessTier: "pro",
    stripeSubscriptionId: "sub_deleted",
  });
  stubs.subscriptionsList.mockResolvedValue({ data: [] });
  stubs.updateUserStripeInfo.mockResolvedValue(undefined);
});

describe("customer.subscription.deleted", () => {
  it("ignores a deleted subscription that is not the user's current subscription", async () => {
    stubs.getUserByStripeCustomerId.mockResolvedValue({
      id: "user_123",
      accessTier: "pro",
      stripeSubscriptionId: "sub_current",
    });

    await processDeletedSubscription();

    expect(stubs.subscriptionsList).not.toHaveBeenCalled();
    expect(stubs.updateUserStripeInfo).not.toHaveBeenCalled();
  });

  it("keeps access when another entitled subscription exists", async () => {
    stubs.subscriptionsList.mockResolvedValue({
      data: [
        {
          id: "sub_recovery",
          status: "past_due",
          trial_end: null,
        },
      ],
    });

    await processDeletedSubscription();

    expect(stubs.subscriptionsList).toHaveBeenCalledWith({
      customer: "cus_123",
      status: "all",
      limit: 20,
    });
    expect(stubs.updateUserStripeInfo).toHaveBeenCalledWith("user_123", {
      stripeSubscriptionId: "sub_recovery",
      trialEndsAt: null,
    });
    expect(stubs.updateUserStripeInfo).not.toHaveBeenCalledWith(
      "user_123",
      expect.objectContaining({ accessTier: "readonly" }),
    );
  });

  it("revokes access when no entitled subscription remains", async () => {
    await processDeletedSubscription();

    expect(stubs.updateUserStripeInfo).toHaveBeenCalledWith("user_123", {
      accessTier: "readonly",
      trialEndsAt: null,
    });
  });
});
