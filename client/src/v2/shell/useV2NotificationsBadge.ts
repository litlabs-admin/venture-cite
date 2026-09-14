import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePersistedState } from "@/hooks/use-persisted-state";

const LAST_SEEN_STORAGE_KEY = "venturecite-v2-notifications-last-seen";
/** How many recent alerts to look at. Matches the "What changed" widget's
 *  default page size (server/routes/dashboard.ts, GET .../alerts). */
const ALERT_SAMPLE_SIZE = 10;

type AlertRow = { sentAt: string };
type AlertsResponse = { success: boolean; data: AlertRow[] };

/**
 * Real unread count for the rail's "Notifications" item, driven by
 * `GET /api/brands/:brandId/alerts` (server/routes/dashboard.ts,
 * server/storage/platformStorage.ts#getAlertHistory).
 *
 * `alert_history` (shared/schema/platform.ts) has no read/acknowledged flag,
 * so there is no server-side "unread" to read. "Unread" here means "sent
 * after the last time this browser opened /v2/notifications" - the same
 * definition a first-open inbox uses, and it is tracked client-side in
 * localStorage per browser (not per brand: an alert on a brand you have not
 * looked at recently still counts, same as a first-open inbox).
 *
 * Returns 0 (no badge) whenever the endpoint has not returned any alerts, so
 * the badge never shows a fabricated count while the query is loading or the
 * brand genuinely has no alerts.
 */
export function useV2NotificationsBadge(
  brandId: string,
  pathname: string,
  enabled: boolean,
): number {
  const [lastSeenAt, setLastSeenAt] = usePersistedState<number>(LAST_SEEN_STORAGE_KEY, 0);

  const { data } = useQuery<AlertsResponse>({
    queryKey: ["/api/brands", brandId, "alerts", { limit: ALERT_SAMPLE_SIZE }],
    enabled: enabled && Boolean(brandId),
    meta: { suppressErrorToast: true },
  });

  const onNotificationsPage =
    pathname === "/v2/notifications" || pathname.startsWith("/v2/notifications/");

  useEffect(() => {
    if (onNotificationsPage) setLastSeenAt(Date.now());
  }, [onNotificationsPage, setLastSeenAt]);

  if (onNotificationsPage) return 0;

  const alerts = data?.data ?? [];
  if (alerts.length === 0) return 0;
  if (!lastSeenAt) return alerts.length;

  return alerts.filter((alert) => new Date(alert.sentAt).getTime() > lastSeenAt).length;
}
