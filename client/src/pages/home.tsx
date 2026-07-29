import { Brain } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useCommandCenterData } from "@/components/command-center/useCommandCenterData";
import { KpiStrip } from "@/components/command-center/KpiStrip";
import { VisibilityChart } from "@/components/command-center/VisibilityChart";
import { RankingsPanel } from "@/components/command-center/RankingsPanel";
import { ActionsStrip } from "@/components/command-center/ActionsStrip";
import { PromptsRow } from "@/components/command-center/PromptsRow";
import { PlatformStrip } from "@/components/command-center/PlatformStrip";
import { BottomRow } from "@/components/command-center/BottomRow";

// ─── Command Center ──────────────────────────────────────────────────────────
// Full-bleed instrument panel, rebuilt against a captured reference DOM
// (see docs/command-center-reference.md for the measured spec).
//
// LAYOUT CONTRACT: this page draws its own hairlines and owns its horizontal
// padding, edge to edge. AppShell gives the Command Center an unpadded canvas
// (see AppShell's `fullBleed` branch) — do not wrap it in a padded container
// or every row's border stops short of the viewport edge.
//
// Row order, top to bottom:
//   1. KPI strip          6 tiles, hairline-separated
//   2. Chart + Rankings   2/3 + 1/3
//   3. Actions            single-line band
//   4. Prompts + Health   2/3 + (Site Health / Perception) stacked
//   5. Platform strip     8 cells
//   6. Citations / AI Traffic / Conversations
//
// DATA HONESTY: every figure traces to an endpoint in useCommandCenterData.
// Panels with no backing source (Rank, Site Health, Perception, AI Traffic,
// Conversations) render `–` plus a line naming what is missing. Nothing on
// this page is generated, estimated, or carried over from a demo fixture.

export default function Home() {
  const { brands, selectedBrandId, isLoading: brandsLoading } = useBrandSelection();
  const d = useCommandCenterData(selectedBrandId);

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
              monitor where ChatGPT, Claude, Perplexity, and Gemini cite you, diagnose the gaps, and
              act on them.
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
    <div className="min-h-screen bg-white">
      {/* data-tour-id values are literal build-gate targets — scripts/
          verify-tour-targets.ts greps for these exact strings and fails the
          build if a registered tour step has nothing to point at. */}
      <div data-tour-id="dashboard.stats">
        <KpiStrip
          visibility={d.hero?.visibilityScore ?? null}
          visibilityDelta={d.hero?.visibilityDelta ?? null}
          mentions7d={d.mentions7d}
          mentionsTruncated={d.mentionsTruncated}
          citationsThisWeek={d.citationsThisWeek}
          loading={d.heroLoading}
        />
      </div>

      <div className="grid grid-cols-1 border-b border-vc-default lg:h-[428px] lg:grid-cols-3">
        <VisibilityChart series={d.visibilitySeries} loading={d.visibilityLoading} />
        <RankingsPanel rows={d.leaderboard} loading={d.leaderboardLoading} />
      </div>

      <div data-tour-id="dashboard.recommendations">
        <ActionsStrip recommendations={d.recommendations} loading={d.recommendationsLoading} />
      </div>

      <PromptsRow prompts={d.prompts} loading={d.promptsLoading} />

      <PlatformStrip platforms={d.platforms} />

      <BottomRow
        weeks={d.weeks}
        totalCitedUrls={d.totalCitedUrls}
        citedUrlsTruncated={d.citedUrlsTruncated}
        topSources={d.topSources}
        loading={d.citationsLoading}
      />
    </div>
  );
}
