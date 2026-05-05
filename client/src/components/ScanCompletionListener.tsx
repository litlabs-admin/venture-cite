import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { ScanJob } from "@shared/schema";

/**
 * ScanCompletionListener — mounts once inside the authenticated tree; renders
 * nothing. Polls /api/brand-mentions/scans/active every 5 s whenever there is
 * at least one active scan in flight, then fires a toast when a scan finishes.
 *
 * CONCERN: The server's getActiveScanJobsForUser (and the individual scan
 * lookup at GET /api/brand-mentions/scans/:scanId) currently return raw
 * scan_jobs rows which do NOT include brandName. The component falls back to
 * "your brand" when the field is absent. A follow-up server change should JOIN
 * brands.name into both responses so the toast shows a meaningful brand label.
 */
export function ScanCompletionListener() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const seenRef = useRef<Set<string>>(new Set());

  const { data } = useQuery<{ rows: Array<ScanJob & { brandName?: string }> }>({
    enabled: !!user,
    queryKey: ["/api/brand-mentions/scans/active"],
    refetchInterval: (query) => {
      const rows = (query.state.data as { rows?: unknown[] } | undefined)?.rows ?? [];
      return rows.length > 0 ? 5000 : false;
    },
    staleTime: 0,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/brand-mentions/scans/active");
      return res.json();
    },
  });

  useEffect(() => {
    if (!data) return;
    const currentIds = new Set(data.rows.map((r) => r.id));

    // Detect previously-seen scans no longer in the active list
    for (const id of Array.from(seenRef.current)) {
      if (!currentIds.has(id)) {
        // Fire-and-forget: look up the final state of the completed scan
        apiRequest("GET", `/api/brand-mentions/scans/${id}`)
          .then((r) => r.json())
          .then((job: ScanJob & { brandName?: string }) => {
            const totals = (job.totals as Record<string, number> | null) ?? {};
            const inserted = totals.inserted ?? 0;
            const brandName = job.brandName ?? "your brand";

            if (job.status === "complete") {
              toast({
                title: `Scan complete for ${brandName}`,
                description: `${inserted} new mention${inserted === 1 ? "" : "s"}`,
                action: (
                  <ToastAction
                    altText="View"
                    onClick={() => setLocation(`/geo-tools?brand=${job.brandId}`)}
                  >
                    View
                  </ToastAction>
                ),
              });
            } else if (job.status === "failed") {
              toast({
                title: `Scan failed for ${brandName}`,
                description: job.error?.slice(0, 200) ?? "Unknown error",
                variant: "destructive",
              });
            }

            queryClient.invalidateQueries({ queryKey: ["/api/brand-mentions"] });
          })
          .catch(() => {
            /* swallow — network blip; next poll will retry if still relevant */
          });
      }
    }

    seenRef.current = currentIds;
  }, [data, toast, setLocation, queryClient]);

  return null;
}

export default ScanCompletionListener;
