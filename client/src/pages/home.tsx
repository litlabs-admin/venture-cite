import { Brain } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useDashboardData } from "@/components/dashboard-panels/useDashboardData";
import { ActivationBanner } from "@/components/dashboard-panels/ActivationBanner";
import { KpiStrip } from "@/components/dashboard-panels/KpiStrip";
import { VisibilityChart } from "@/components/dashboard-panels/VisibilityChart";
import { RankingsPanel } from "@/components/dashboard-panels/RankingsPanel";
import { ActionsStrip } from "@/components/dashboard-panels/ActionsStrip";
import { PromptsRow } from "@/components/dashboard-panels/PromptsRow";
import { PlatformStrip } from "@/components/dashboard-panels/PlatformStrip";
import { GapsRow } from "@/components/dashboard-panels/GapsRow";
import { BottomRow } from "@/components/dashboard-panels/BottomRow";

// ─── Dashboard ──────────────────────────────────────────────────────────
// Full-bleed instrument panel, rebuilt against a captured reference DOM
// (see docs/dashboard-reference.md for the measured spec).
//
// LAYOUT CONTRACT: this page draws its own hairlines and owns its horizontal
// padding, edge to edge. AppShell gives the Dashboard an unpadded canvas
// (see AppShell's `fullBleed` branch) - do not wrap it in a padded container
// or every row's border stops short of the viewport edge.
//
// Row order, top to bottom:
//   1. KPI strip          6 tiles, hairline-separated
//   2. Chart + Rankings   2/3 + 1/3
//   3. Actions            single-line band
//   4. Prompts + Health   2/3 + (Site Health / Perception) stacked
//   5. Platform strip     8 cells
//   6. Competitor gaps   full width
//   7. Citations / Hallucinations / Listicles
//
// DATA HONESTY: every figure traces to an endpoint in useDashboardData.
// Panels with no backing source render `–` plus a line naming what is
// missing. Nothing here is generated, estimated, or carried over from a demo
// fixture.
//
// "AI Traffic" and "Conversations" used to occupy row 7 and two KPI tiles.
// Both were permanent empty states - they need a Google Analytics connection
// and AI-crawler tracking on the customer's domain respectively, neither of
// which this product has - so a third of the dashboard asked you to connect
// something that cannot be connected. They were replaced with hallucination
// severity and "best of" listicle presence: both already measured for every brand,
// both previously surfaced nowhere on this page. `Rank` is the one remaining
// deliberate `–`: it needs a cross-account brand index that does not exist.

export default function Home() {
  const { brands, selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const d = useDashboardData(selectedBrandId);

  if (brandsLoading) {
    return (
      <div className="space-y-px">
        <Skeleton className="h-[114px] w-full" />
        <Skeleton className="h-[428px] w-full" />
        <Skeleton className="h-[69px] w-full" />
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="px-8 py-10">
        <EmptyState
          icon={Brain}
          title="Create a brand to get started"
          description={
            <>
              Set up your first brand and we&apos;ll build a live AI-visibility operating system:
              monitor where ChatGPT, Claude, Perplexity, Gemini, DeepSeek and Grok cite you,
              diagnose the gaps, and act on them.
            </>
          }
          action={{
            label: "Create your first brand",
            href: "/setup?tab=brands",
            onClick: () => {},
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-vc-page">
      {/* Renders only while this brand's activation pipeline is still running
          (or has failed). Without it, a brand created minutes ago is
          indistinguishable from one that finished and genuinely has no data. */}
      <ActivationBanner brandId={selectedBrandId} />
      {/* useDashboardData fans out to ~13 endpoints; every one of them falls
          back to `[]`/`null` on failure so a panel can render "not measured"
          instead of crashing. That fallback used to make a failed request
          indistinguishable from a brand that genuinely has no data yet - the
          exact honesty violation this page's DATA HONESTY contract (above)
          exists to prevent. This banner is the distinct "couldn't load"
          signal the reference Dashboard (client/src/pages/internal/Dashboard.tsx)
          shows for the same failure. */}
      {d.hasError && (
        <div
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-warning bg-warning-subtle px-4 py-2 text-caption text-warning"
          role="alert"
        >
          <span>Some dashboard data couldn&apos;t be loaded. Numbers below may be incomplete.</span>
          <button
            type="button"
            onClick={d.retryFailed}
            className="font-medium underline underline-offset-2 hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}
      {/* data-tour-id values are literal build-gate targets - scripts/
          verify-tour-targets.ts greps for these exact strings and fails the
          build if a registered tour step has nothing to point at. */}
      <div data-tour-id="dashboard.stats">
        <KpiStrip
          visibility={d.hero?.visibilityScore ?? null}
          visibilityDelta={d.hero?.visibilityDelta ?? null}
          mentions7d={d.mentions7d}
          mentionsTruncated={d.mentionsTruncated}
          mentionsScanned={d.mentionsScanned}
          mentionsScanLoading={d.mentionsScanLoading}
          citationsThisWeek={d.citationsThisWeek}
          loading={d.heroLoading}
          ownRank={d.ownRank}
          trackedBrands={d.trackedBrands}
          leaderboardLoading={d.leaderboardLoading}
          hallucinations={d.hallucinations}
          hallucinationsLoading={d.hallucinationsLoading}
          listicles={d.listicles}
          listiclesLoading={d.listiclesLoading}
        />
      </div>

      <div className="grid grid-cols-1 border-b border-vc-default lg:h-[428px] lg:grid-cols-3">
        <VisibilityChart series={d.visibilitySeries} loading={d.visibilityLoading} />
        <RankingsPanel rows={d.leaderboard} loading={d.leaderboardLoading} />
      </div>

      <div data-tour-id="dashboard.recommendations">
        <ActionsStrip recommendations={d.recommendations} loading={d.recommendationsLoading} />
      </div>

      <PromptsRow
        prompts={d.prompts}
        loading={d.promptsLoading}
        siteHealth={d.siteHealth}
        siteHealthLoading={d.siteHealthLoading}
        tone={d.tone}
        toneLoading={d.toneLoading}
        perception={d.perception}
        perceptionLoading={d.perceptionLoading}
      />

      <PlatformStrip platforms={d.platforms} />

      <GapsRow categories={d.gapCategories} rows={d.gapRows} gapLoading={d.gapLoading} />

      <BottomRow
        weeks={d.weeks}
        totalCitedUrls={d.totalCitedUrls}
        citedUrlsTruncated={d.citedUrlsTruncated}
        topSources={d.topSources}
        loading={d.citationsLoading}
        hallucinations={d.hallucinations}
        hallucinationsLoading={d.hallucinationsLoading}
        listicles={d.listicles}
        listiclesLoading={d.listiclesLoading}
      />
    </div>
  );
}
