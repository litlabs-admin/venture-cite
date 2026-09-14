// Live adapter for /v2/settings/billing.
//
// Real plan names and prices come from shared/schema/identity.ts
// (PLAN_PRICE_CENTS, SELLABLE_TIERS) - never the reference render's sample
// "Team plan $299". Real usage comes from server/routes/v2Billing.ts, which
// reads this brand's own rows. Subscription state, invoices, checkout and
// the billing portal reuse the existing endpoints in
// server/routes/billing.ts unmodified.

import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useAuth } from "@/hooks/use-auth";
import { isAllowedStripeRedirect } from "@/lib/urlSafety";
import { toast } from "@/hooks/use-toast";
import type { V2LiveResult } from "@/v2/contracts/screen";
import { PLAN_PRICE_CENTS, type SellableTier } from "@shared/schema";
import {
  useBillingUsage,
  useCancelSubscription,
  useInvoices,
  useOpenBillingPortal,
  useResumeSubscription,
  useSubscription,
  type InvoiceRow,
  type SubscriptionInfo,
} from "@/v2/data/v2Billing";
import type { Board44Data, Board44Invoice, Board44Plan } from "./Screen";

const PLAN_NAMES: Record<SellableTier, string> = { pro: "Pro", agency: "Agency" };
const PLAN_DESCRIPTIONS: Record<SellableTier, string> = {
  pro: "AI-visibility tracking and measurement for one growing brand.",
  agency: "Tracking, measurement and content work across multiple brands.",
};

function isSellableTier(value: string | null | undefined): value is SellableTier {
  return value === "pro" || value === "agency";
}

function planFromSubscription(sub: SubscriptionInfo): Board44Plan {
  const tier = isSellableTier(sub.tier) ? sub.tier : null;
  return {
    name: tier ? PLAN_NAMES[tier] : (sub.planName ?? "Current plan"),
    description: tier ? PLAN_DESCRIPTIONS[tier] : "Your current plan, as recorded by Stripe.",
    status: sub.status,
    nextRenewalAt: sub.currentPeriodEnd
      ? new Date(sub.currentPeriodEnd * 1000).toISOString()
      : null,
    monthlyPriceCents: tier ? PLAN_PRICE_CENTS[tier] : (sub.amount ?? null),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    trialEndsAt: sub.trialEnd ? new Date(sub.trialEnd * 1000).toISOString() : null,
  };
}

function mapInvoice(row: InvoiceRow): Board44Invoice {
  return {
    id: row.id,
    dateIso: new Date(row.created * 1000).toISOString(),
    number: row.number,
    description: row.number ? `Invoice ${row.number}` : "Invoice",
    amountCents: row.status === "paid" ? row.amountPaid : row.amountDue,
    status: row.status ?? "unknown",
    hostedInvoiceUrl: row.hostedInvoiceUrl,
    invoicePdf: row.invoicePdf,
  };
}

function displayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || "Account owner";
}

function queryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load billing.";
}

export function useBoard44Data(): V2LiveResult<Board44Data> {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const { user, isLoading: userLoading } = useAuth();
  const usageQuery = useBillingUsage(selectedBrandId);
  const subscriptionQuery = useSubscription();
  const invoicesQuery = useInvoices();

  const portal = useOpenBillingPortal();
  const cancel = useCancelSubscription();
  const resume = useResumeSubscription();

  if (!selectedBrandId && !brandsLoading) {
    return { state: { kind: "empty", reason: "No brand is selected." } };
  }
  if (
    brandsLoading ||
    userLoading ||
    usageQuery.isPending ||
    subscriptionQuery.isPending ||
    invoicesQuery.isPending
  ) {
    return { state: { kind: "loading" } };
  }
  if (usageQuery.isError || subscriptionQuery.isError || invoicesQuery.isError) {
    const error = usageQuery.error ?? subscriptionQuery.error ?? invoicesQuery.error;
    return { state: { kind: "error", message: queryErrorMessage(error) } };
  }
  if (!usageQuery.data) {
    return { state: { kind: "not-measured", reason: "Billing usage is not available." } };
  }

  const sub = subscriptionQuery.data ?? null;
  const invoices = (invoicesQuery.data ?? []).map(mapInvoice);

  const openPortal = () => {
    portal.mutate(undefined, {
      onSuccess: ({ url }) => {
        if (isAllowedStripeRedirect(url)) {
          window.location.href = url;
        } else {
          toast({
            description: "Received an unexpected redirect URL from the server.",
            variant: "destructive",
          });
        }
      },
      onError: (error) => {
        toast({
          description: error.message || "Failed to open the billing portal.",
          variant: "destructive",
        });
      },
    });
  };

  const data: Board44Data = {
    brandId: selectedBrandId,
    mode: "guided",
    brandName: selectedBrand?.name ?? "Selected brand",
    plan: sub ? planFromSubscription(sub) : null,
    paymentMethodNote: sub ? "Managed in the Stripe billing portal." : "No payment method on file.",
    usage: {
      periodDays: usageQuery.data.periodDays,
      brands: { used: usageQuery.data.brandsUsed, limit: usageQuery.data.brandsLimit },
      trackedQuestions: {
        used: usageQuery.data.trackedQuestionsUsed,
        limit: usageQuery.data.trackedQuestionsCap,
      },
      citationRuns: { used: usageQuery.data.citationRunsThisPeriod, limit: null },
      contentGenerated: {
        used: usageQuery.data.contentGeneratedUsed,
        limit: usageQuery.data.contentGeneratedLimit,
      },
    },
    invoices,
    billingContact: user
      ? { name: displayName(user), email: user.email }
      : { name: "Account owner", email: null },
    retentionDays: 30,
    actions: {
      onManageBilling: openPortal,
      isManageBillingPending: portal.isPending,
      onCancelPlan: () => cancel.mutate(),
      isCancelPending: cancel.isPending,
      onResumePlan: () => resume.mutate(),
      isResumePending: resume.isPending,
    },
  };

  if (usageQuery.isFetching || subscriptionQuery.isFetching || invoicesQuery.isFetching) {
    const timestamps = [
      usageQuery.dataUpdatedAt,
      subscriptionQuery.dataUpdatedAt,
      invoicesQuery.dataUpdatedAt,
    ].filter((time) => time > 0);
    return {
      state: {
        kind: "stale",
        reason: "Billing data is refreshing.",
        asOf: new Date(Math.min(...timestamps)).toISOString(),
      },
      data,
    };
  }
  return { state: { kind: "ready" }, data };
}
