// Live: Slack alert-webhook state (alert_settings, via the new
// server/routes/v2Settings.ts) and Buffer connection state (users table, via
// the existing /api/buffer/* routes) plus real recent activity (alert_history)
// and real request-access history (audit_logs).
//
// Google Search Console, GA4, HubSpot, and Salesforce have no connector
// anywhere in this codebase (verified: no route, no schema table, no client
// integration). They render as a static "not connected" list with a working
// request-access action rather than a fake connected state or a "coming soon"
// panel - see server/routes/v2Settings.ts's request-access endpoint.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useV2Mode } from "@/v2/shell/useV2Mode";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board25ActivityEntry, Board25Data, Board25NoBackendProvider } from "./Screen";

const NO_BACKEND_PROVIDERS: readonly Board25NoBackendProvider[] = [
  {
    id: "google_search_console",
    name: "Google Search Console",
    category: "Visibility evidence",
    reads: "Search queries, impressions, clicks, pages",
    verifies: "Branded mentions, placement, query lift",
  },
  {
    id: "ga4",
    name: "GA4",
    category: "Visibility evidence",
    reads: "Sessions, users, conversions, landing pages",
    verifies: "Traffic from PR, assisted conversions",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "Business outcomes",
    reads: "Contacts, companies, deals, revenue",
    verifies: "Pipeline from PR, deal influence, revenue impact",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    category: "Business outcomes",
    reads: "Leads, opportunities, accounts, revenue",
    verifies: "Pipeline from PR, deal influence, revenue impact",
  },
];

type IntegrationsResponse = {
  success: boolean;
  data: {
    slack: { connected: boolean; lastTriggered: string | null };
    buffer: { connected: boolean };
    recentActivity: Array<{
      id: string;
      alertType: string;
      message: string;
      sentVia: string;
      sentAt: string;
    }>;
    requests: Array<{ provider: string; requestedAt: string }>;
  };
};

function activityFrom(data: IntegrationsResponse["data"]): readonly Board25ActivityEntry[] {
  return data.recentActivity.map((row) => ({
    id: row.id,
    message: row.message,
    detail: row.sentVia === "slack" ? "Sent to Slack" : "Recorded in-app",
    at: row.sentAt,
  }));
}

export function useBoard25Data(): V2LiveResult<Board25Data> {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const { mode } = useV2Mode();
  const queryClient = useQueryClient();

  const integrationsQuery = useQuery<IntegrationsResponse>({
    queryKey: ["/api/v2/settings", selectedBrandId, "integrations"],
    enabled: Boolean(selectedBrandId),
    meta: { suppressErrorToast: true },
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/v2/settings/${encodeURIComponent(selectedBrandId)}/integrations`,
      );
      return (await res.json()) as IntegrationsResponse;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["/api/v2/settings", selectedBrandId, "integrations"],
    });

  const connectSlackMutation = useMutation({
    mutationFn: async (webhookUrl: string) => {
      const res = await apiRequest(
        "POST",
        `/api/v2/settings/${selectedBrandId}/integrations/slack/connect`,
        { webhookUrl },
      );
      return res.json();
    },
    onSuccess: invalidate,
  });

  const disconnectSlackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "DELETE",
        `/api/v2/settings/${selectedBrandId}/integrations/slack`,
      );
      return res.json();
    },
    onSuccess: invalidate,
  });

  const testSlackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/v2/settings/${selectedBrandId}/integrations/slack/test`,
      );
      return res.json();
    },
    onSuccess: invalidate,
  });

  const connectBufferMutation = useMutation({
    mutationFn: async (accessToken: string) => {
      const res = await apiRequest("POST", "/api/buffer/connect", { accessToken });
      return res.json();
    },
    onSuccess: invalidate,
  });

  const disconnectBufferMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/buffer/connection");
      return res.json();
    },
    onSuccess: invalidate,
  });

  const requestAccessMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/v2/settings/${selectedBrandId}/integrations/${providerId}/request-access`,
      );
      return res.json();
    },
    onSuccess: invalidate,
  });

  if (brandsLoading) return { state: { kind: "loading" } };
  if (!selectedBrandId) return { state: { kind: "empty", reason: "No brand is selected." } };
  if (integrationsQuery.isPending) return { state: { kind: "loading" } };
  if (integrationsQuery.isError || !integrationsQuery.data) {
    return {
      state: {
        kind: "error",
        message:
          integrationsQuery.error instanceof Error
            ? integrationsQuery.error.message
            : "Failed to load integrations.",
      },
    };
  }

  const response = integrationsQuery.data.data;

  const data: Board25Data = {
    brandId: selectedBrandId,
    mode,
    noBackendProviders: NO_BACKEND_PROVIDERS,
    requestedProviders: response.requests.map((row) => row.provider),
    slack: response.slack,
    buffer: response.buffer,
    recentActivity: activityFrom(response),
    actions: {
      connectSlack: async (webhookUrl) => {
        await connectSlackMutation.mutateAsync(webhookUrl);
      },
      disconnectSlack: async () => {
        await disconnectSlackMutation.mutateAsync();
      },
      testSlack: async () => {
        await testSlackMutation.mutateAsync();
      },
      connectBuffer: async (accessToken) => {
        await connectBufferMutation.mutateAsync(accessToken);
      },
      disconnectBuffer: async () => {
        await disconnectBufferMutation.mutateAsync();
      },
      requestAccess: async (providerId) => {
        await requestAccessMutation.mutateAsync(providerId);
      },
    },
  };

  if (integrationsQuery.isFetching) {
    return {
      state: {
        kind: "stale",
        reason: "Integration status is refreshing.",
        asOf: new Date(integrationsQuery.dataUpdatedAt).toISOString(),
      },
      data,
    };
  }

  return { state: { kind: "ready" }, data };
}
