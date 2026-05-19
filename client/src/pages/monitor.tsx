import { lazy } from "react";
import { BarChart3, Link2, Swords, History, Radar } from "lucide-react";
import SpineShell from "@/components/SpineShell";
import { brandScoped } from "@/components/BrandScopedTab";
import TrendsTab from "@/components/intelligence/TrendsTab";
import MentionsTab from "@/components/geo-tools/MentionsTab";
import { useBrandSelection } from "@/hooks/use-brand-selection";

// "Where do I stand?" — the canonical analytics + citation-run home.
// Overview is the full AI-visibility report relocated from the old `/`
// dashboard (monitor-overview.tsx), powered by the single /api/dashboard
// aggregate — the duplicate /api/geo-analytics-backed page is retired.
// Trends is the analytical half of the dissolved ai-intelligence page (its
// Competitors tab is dropped — competitors.tsx is the single canonical
// competitor view, embedded here as the Competitors tab; its Share-of-Answer
// tab was removed because the prompt_portfolio table is dead — the server
// synthesized the numbers, so the surface could not be defended).
// Mentions is the detected brand-mention scanner (Reddit / Hacker News /
// manual adds) — distinct from /act › Community (authored outreach).
const MonitorOverview = lazy(() => import("@/pages/monitor-overview"));
const Citations = lazy(() => import("@/pages/citations"));
const Competitors = lazy(() => import("@/pages/competitors"));

const Trends = brandScoped(TrendsTab);

// MentionsTab takes `brandId` (not `selectedBrandId`) and renders its own
// no-brand / no-scan empty states. The brand is chosen via the global
// BrandSelector in the AppShell context bar; here we just thread the
// selected id through.
function MentionsScanner() {
  const { selectedBrandId } = useBrandSelection();
  return <MentionsTab brandId={selectedBrandId ?? null} />;
}

export default function Monitor() {
  return (
    <SpineShell
      defaultTab="overview"
      tabs={[
        { value: "overview", label: "Overview", icon: BarChart3, Component: MonitorOverview },
        { value: "citations", label: "Citations", icon: Link2, Component: Citations },
        { value: "competitors", label: "Competitors", icon: Swords, Component: Competitors },
        { value: "trends", label: "Trends", icon: History, Component: Trends },
        { value: "mentions", label: "Mentions", icon: Radar, Component: MentionsScanner },
      ]}
    />
  );
}
