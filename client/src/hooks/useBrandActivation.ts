import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Is this brand still being built out by the onboarding autopilot?
//
// The autopilot (fact scrape → competitors → prompts → citation run → site
// health/mentions/listicles/perception) already ran automatically, and
// welcome.tsx already renders a rich progress panel for it. But that panel is
// gated on LOCAL component state (`scene === "activating"`), so it disappears
// the moment the user reloads, navigates, or opens the dashboard directly.
// From then on the dashboard shows "–" and "not scanned yet" - copy that is
// indistinguishable from a brand that is fully activated and genuinely has no
// data. "We are still building this" and "there is nothing here" are opposite
// statements, and the UI was making the first one look like the second.
//
// This hook is deliberately modelled on useActiveCitationRuns: driven by a
// SERVER query rather than component state, so any screen can ask "is this
// brand still activating?" and get a truthful answer after a reload.
//
// Polling stops the moment the run reaches a terminal state, and never starts
// for a brand that is already done - the global queryClient sets
// refetchInterval:false precisely so polling is opt-in and narrow.

export type BrandActivationStatus =
  | "idle"
  | "pending"
  | "scraping_facts"
  | "generating_prompts"
  | "running_citations"
  | "completed"
  | "failed";

export type BrandActivation = {
  status: BrandActivationStatus;
  step: number;
  progress: Record<string, unknown>;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

/** Statuses that mean work is genuinely in flight right now. */
const ACTIVE: BrandActivationStatus[] = [
  "pending",
  "scraping_facts",
  "generating_prompts",
  "running_citations",
];

const POLL_MS = 5_000;

/** Human-readable phase, matching the order the autopilot actually runs in. */
export function activationPhaseLabel(status: BrandActivationStatus): string {
  switch (status) {
    case "scraping_facts":
      return "Reading your website";
    case "generating_prompts":
      return "Writing the questions we'll track";
    case "running_citations":
      return "Asking the AI engines about you";
    case "pending":
      return "Getting started";
    default:
      return "Working";
  }
}

export function useBrandActivation(brandId: string | null | undefined) {
  const query = useQuery<{ success: boolean; data: BrandActivation }>({
    queryKey: ["/api/onboarding/autopilot-status", brandId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/onboarding/autopilot-status/${brandId}`);
      return (await r.json()) as { success: boolean; data: BrandActivation };
    },
    enabled: !!brandId,
    refetchInterval: (q) => {
      // Pause with the tab hidden - nobody is reading a progress banner they
      // cannot see, and this hook is mounted app-wide.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
      const status = q.state.data?.data?.status;
      // Stop entirely once terminal. A completed brand must not keep polling
      // forever just because a page stayed open.
      return status && ACTIVE.includes(status) ? POLL_MS : false;
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
    // A 404/permission error here must never break the page it is mounted on -
    // this is a progress hint, not load-bearing data.
    retry: false,
  });

  const activation = query.data?.data ?? null;
  const status = activation?.status ?? null;

  return {
    activation,
    status,
    /** Work is in flight right now. */
    isActivating: !!status && ACTIVE.includes(status),
    /** The run ended badly and the dashboard will stay thin until it is retried. */
    hasFailed: status === "failed",
    phaseLabel: status ? activationPhaseLabel(status) : "",
    isLoading: query.isLoading,
  };
}
