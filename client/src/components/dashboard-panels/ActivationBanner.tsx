import { Loader2, AlertCircle } from "lucide-react";
import { useBrandActivation } from "@/hooks/useBrandActivation";

// ─── "We're still building this" banner ──────────────────────────────────────
// A brand created minutes ago has almost no data yet, and every dashboard
// panel renders that as "–" / "not scanned yet" / "Gap analysis appears after
// your first citation run finishes." Correct copy for a finished brand with
// nothing to show - actively misleading for one whose pipeline is still
// running, which is the state EVERY new brand is in for its first few minutes.
//
// welcome.tsx already shows a good activation panel, but it is gated on local
// component state, so it is gone after a reload or a direct visit to the
// dashboard. This banner is driven by the server, so the answer survives both.
//
// Renders nothing at all when the brand is activated - the dashboard's normal
// empty states are correct then, and a permanently-present banner would be
// noise. It also stays silent while the first status request is in flight, so
// it never flashes on a fully-populated dashboard.
export function ActivationBanner({ brandId }: { brandId: string | null }) {
  const { isActivating, hasFailed, phaseLabel, activation } = useBrandActivation(brandId);

  if (!isActivating && !hasFailed) return null;

  if (hasFailed) {
    // Say it plainly rather than leaving the user to infer it from thin data.
    // The retry affordance already exists in the onboarding flow; this is
    // about not silently pretending an empty dashboard is a finished one.
    return (
      <div
        className="flex items-start gap-3 border-b border-vc-default px-8 py-4"
        role="status"
        aria-live="polite"
      >
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-vc-danger" aria-hidden />
        <div className="min-w-0">
          <p className="text-data font-semibold text-vc-primary">
            Setup didn&apos;t finish for this brand
          </p>
          <p className="text-caption text-vc-secondary">
            The panels below are incomplete because the run stopped early. It will be retried
            automatically; you can also re-run it from setup.
          </p>
        </div>
      </div>
    );
  }

  // Citation progress is the one phase with a real numerator/denominator, so
  // show it when present rather than a fake percentage for every phase.
  const progress = activation?.progress as
    { citationsRun?: number; citationsTotal?: number } | undefined;
  const run = typeof progress?.citationsRun === "number" ? progress.citationsRun : null;
  const total = typeof progress?.citationsTotal === "number" ? progress.citationsTotal : null;
  const counter = run !== null && total !== null && total > 0 ? `${run} of ${total}` : null;

  return (
    <div
      className="flex items-start gap-3 border-b border-vc-default px-8 py-4"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-vc-accent" aria-hidden />
      <div className="min-w-0">
        <p className="text-data font-semibold text-vc-primary">
          Building your dashboard — {phaseLabel}
          {counter ? ` (${counter})` : ""}
        </p>
        <p className="text-caption text-vc-secondary">
          Panels below fill in as each step finishes. This runs in the background, so you can leave
          this page.
        </p>
      </div>
    </div>
  );
}
