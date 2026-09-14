import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// /v2/settings/billing's reads and writes.
//
// Usage (brands, tracked questions, citation runs, content generated) comes
// from the new namespaced ["v2", ...] endpoint - see server/routes/v2Billing.ts.
// The subscription, invoices, checkout, portal, cancel and resume reads
// reuse the EXISTING un-namespaced endpoints the legacy Settings page already
// uses (client/src/pages/settings.tsx), unmodified: /api/billing/subscription,
// /api/billing/invoices, /api/billing/portal-session, /api/billing/cancel,
// /api/billing/resume, /api/stripe/products, /api/stripe/checkout.

export type BillingUsageView = {
  tier: string;
  brandsUsed: number;
  /** -1 means unlimited. */
  brandsLimit: number;
  trackedQuestionsUsed: number;
  trackedQuestionsCap: number;
  citationRunsThisPeriod: number;
  periodDays: number;
  contentGeneratedUsed: number;
  /** -1 unlimited, 0 not offered on this plan. */
  contentGeneratedLimit: number;
};

async function readJson<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await apiRequest("POST", url, body);
  return (await response.json()) as T;
}

export function useBillingUsage(brandId: string) {
  return useQuery<BillingUsageView>({
    queryKey: ["v2", "billing", "usage", brandId],
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () =>
      readJson<BillingUsageView>(`/api/v2/billing/${encodeURIComponent(brandId)}/usage`),
  });
}

export type SubscriptionInfo = {
  status: string;
  planName: string | null;
  tier: string | null;
  amount: number | null;
  currency: string;
  interval: string;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd: boolean;
  trialEnd?: number | null;
};

export function useSubscription() {
  return useQuery<SubscriptionInfo | null>({
    queryKey: ["/api/billing/subscription"],
    meta: { suppressErrorToast: true },
    queryFn: () => readJson<SubscriptionInfo | null>("/api/billing/subscription"),
  });
}

export type InvoiceRow = {
  id: string;
  number: string | null;
  status: string | null;
  amountPaid: number;
  amountDue: number;
  currency: string;
  created: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};

export function useInvoices() {
  return useQuery<InvoiceRow[]>({
    queryKey: ["/api/billing/invoices"],
    meta: { suppressErrorToast: true },
    queryFn: () => readJson<InvoiceRow[]>("/api/billing/invoices"),
  });
}

const billingKeys = {
  subscription: ["/api/billing/subscription"] as const,
  invoices: ["/api/billing/invoices"] as const,
};

export function useOpenBillingPortal() {
  return useMutation<{ url: string }, Error, void>({
    mutationFn: async () => {
      const json = await postJson<{ success?: boolean; url?: string; error?: string }>(
        "/api/billing/portal-session",
      );
      if (!json.url) throw new Error(json.error ?? "Failed to open billing portal");
      return { url: json.url };
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation<
    { success?: boolean; error?: string; data?: { cancelAtPeriodEnd: true; endsAt?: number } },
    Error,
    void
  >({
    mutationFn: () => postJson("/api/billing/cancel"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: billingKeys.subscription });
    },
  });
}

export function useResumeSubscription() {
  const queryClient = useQueryClient();
  return useMutation<{ success?: boolean; error?: string }, Error, void>({
    mutationFn: () => postJson("/api/billing/resume"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: billingKeys.subscription });
    },
  });
}
