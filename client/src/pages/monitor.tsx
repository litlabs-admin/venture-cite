import { lazy } from "react";
import { BarChart3, Link2, Swords, Target, History, Radar } from "lucide-react";
import SpineShell from "@/components/SpineShell";
import { brandScoped } from "@/components/BrandScopedTab";
import ShareOfAnswerTab from "@/components/intelligence/ShareOfAnswerTab";
import TrendsTab from "@/components/intelligence/TrendsTab";
import MentionsTab from "@/components/geo-tools/MentionsTab";
import BrandSelector from "@/components/BrandSelector";
import { useBrandSelection } from "@/hooks/use-brand-selection";

// "Where do I stand?" — the canonical analytics + citation-run home.
// Overview is the full AI-visibility report relocated from the old `/`
// dashboard (monitor-overview.tsx), powered by the single /api/dashboard
// aggregate — the duplicate /api/geo-analytics-backed page is retired.
// Share-of-Answer and Trends are the analytical halves of the dissolved
// ai-intelligence page (its Competitors tab is dropped — competitors.tsx is
// the single canonical competitor view, embedded here as the Competitors tab).
// Mentions is the detected brand-mention scanner (Reddit / Hacker News /
// manual adds) — distinct from /act › Community (authored outreach).
const MonitorOverview = lazy(() => import("@/pages/monitor-overview"));
const Citations = lazy(() => import("@/pages/citations"));
const Competitors = lazy(() => import("@/pages/competitors"));

const ShareOfAnswer = brandScoped(ShareOfAnswerTab);
const Trends = brandScoped(TrendsTab);

// MentionsTab takes `brandId` (not `selectedBrandId`) and renders its own
// no-brand / no-scan empty states, so it is wired directly with a brand
// selector rather than via brandScoped's gate.
function MentionsScanner() {
  const { selectedBrandId, brands } = useBrandSelection();
  return (
    <div className="space-y-4">
      {brands.length > 0 ? (
        <div className="flex justify-end">
          <BrandSelector />
        </div>
      ) : null}
      <MentionsTab brandId={selectedBrandId ?? null} />
    </div>
  );
}

export default function Monitor() {
  return (
    <SpineShell
      defaultTab="overview"
      tabs={[
        { value: "overview", label: "Overview", icon: BarChart3, Component: MonitorOverview },
        { value: "citations", label: "Citations", icon: Link2, Component: Citations },
        { value: "competitors", label: "Competitors", icon: Swords, Component: Competitors },
        {
          value: "share-of-answer",
          label: "Share of Answer",
          icon: Target,
          Component: ShareOfAnswer,
        },
        { value: "trends", label: "Trends", icon: History, Component: Trends },
        { value: "mentions", label: "Mentions", icon: Radar, Component: MentionsScanner },
      ]}
    />
  );
}
