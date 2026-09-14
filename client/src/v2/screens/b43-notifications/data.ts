// Live: the notification feed and the settings rail are both live, reading
// server/routes/v2Notifications.ts's composed inbox (alert_history,
// citation_runs, brand_fact_sheet conflicts, work_tasks/work_award_events)
// and its settings view (alert_settings + notification_preferences). There
// is nothing pending behind those two reads - the route only exposes fields
// backed by real columns, so there is no "not measured" state to carry here.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { apiRequest } from "@/lib/queryClient";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import type { V2LiveResult } from "@/v2/contracts/screen";
import type { V2Mode } from "@/v2/contracts/shell";
import type { Board43Data, Board43Notification, Board43Settings } from "./Screen";

type RawNotificationsResponse = { brandName: string; notifications: Board43Notification[] };

function notificationsUrl(brandId: string): string {
  return `/api/v2/brands/${encodeURIComponent(brandId)}/notifications`;
}

function settingsUrl(brandId: string): string {
  return `/api/v2/brands/${encodeURIComponent(brandId)}/notification-settings`;
}

function queryKey(brandId: string) {
  return ["v2", "notifications", brandId] as const;
}

function settingsQueryKey(brandId: string) {
  return ["v2", "notifications", "settings", brandId] as const;
}

async function readJson<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

export function useNotificationsQuery(brandId: string) {
  return useQuery<RawNotificationsResponse>({
    queryKey: queryKey(brandId),
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () => readJson<RawNotificationsResponse>(notificationsUrl(brandId)),
  });
}

export function useNotificationSettingsQuery(brandId: string) {
  return useQuery<Board43Settings>({
    queryKey: settingsQueryKey(brandId),
    enabled: Boolean(brandId),
    meta: { suppressErrorToast: true },
    queryFn: () => readJson<Board43Settings>(settingsUrl(brandId)),
  });
}

export function useMarkNotificationRead(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (key) => {
      await apiRequest("POST", `${notificationsUrl(brandId)}/read`, { key });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKey(brandId) });
    },
  });
}

export function useMarkAllNotificationsRead(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string[]>({
    mutationFn: async (keys) => {
      await apiRequest("POST", `${notificationsUrl(brandId)}/read-all`, { keys });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKey(brandId) });
    },
  });
}

export function useUpdateNotificationSettings(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation<Board43Settings, Error, Partial<Board43Settings>>({
    mutationFn: async (patch) => {
      const response = await apiRequest("PATCH", settingsUrl(brandId), patch);
      const payload = (await response.json()) as { success: boolean; data: Board43Settings };
      return payload.data;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsQueryKey(brandId), settings);
    },
  });
}

export function mapBoard43Data(
  brandId: string,
  mode: V2Mode,
  notifications: RawNotificationsResponse,
  settings: Board43Settings,
): Board43Data {
  return {
    brandId,
    mode,
    brandName: notifications.brandName,
    notifications: notifications.notifications,
    settings,
  };
}

function queryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load notifications.";
}

export function useBoard43Data(): V2LiveResult<Board43Data> {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const search = useSearch({ strict: false });
  const mode: V2Mode = search.mode === "expert" ? "expert" : "guided";

  const notificationsQuery = useNotificationsQuery(selectedBrandId);
  const settingsQuery = useNotificationSettingsQuery(selectedBrandId);

  if (!selectedBrandId && !brandsLoading) {
    return { state: { kind: "empty", reason: "No brand is selected." } };
  }
  if (brandsLoading || notificationsQuery.isPending || settingsQuery.isPending) {
    return { state: { kind: "loading" } };
  }
  if (notificationsQuery.isError || settingsQuery.isError) {
    const error = notificationsQuery.error ?? settingsQuery.error;
    return { state: { kind: "error", message: queryErrorMessage(error) } };
  }
  if (!notificationsQuery.data || !settingsQuery.data) {
    return { state: { kind: "not-measured", reason: "Notification data is not available." } };
  }

  const data = mapBoard43Data(selectedBrandId, mode, notificationsQuery.data, settingsQuery.data);
  if (notificationsQuery.isFetching || settingsQuery.isFetching) {
    const timestamps = [notificationsQuery.dataUpdatedAt, settingsQuery.dataUpdatedAt].filter(
      (time) => time > 0,
    );
    return {
      state: {
        kind: "stale",
        reason: "Notifications are refreshing.",
        asOf: new Date(Math.min(...timestamps)).toISOString(),
      },
      data,
    };
  }
  return { state: { kind: "ready" }, data };
}
