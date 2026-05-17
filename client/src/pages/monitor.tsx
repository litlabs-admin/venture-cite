import { lazy } from "react";
import { BarChart3, Link2, Swords, Target, History, Users } from "lucide-react";
import SpineShell from "@/components/SpineShell";
import { brandScoped } from "@/components/BrandScopedTab";
import ShareOfAnswerTab from "@/components/intelligence/ShareOfAnswerTab";
import TrendsTab from "@/components/intelligence/TrendsTab";

// "Where do I stand?" — the canonical analytics + citation-run home.
// Overview is the full AI-visibility report relocated from the old `/`
// dashboard (monitor-overview.tsx), powered by the single /api/dashboard
// aggregate — the duplicate /api/geo-analytics-backed page is retired.
// Share-of-Answer and Trends are the analytical halves of the dissolved
// ai-intelligence page (its Competitors tab is dropped — competitors.tsx is
// the single canonical competitor view, embedded here as the Competitors tab).
const MonitorOverview = lazy(() => import("@/pages/monitor-overview"));
const Citations = lazy(() => import("@/pages/citations"));
const Competitors = lazy(() => import("@/pages/competitors"));
const CommunityEngagement = lazy(() => import("@/pages/community-engagement"));

const ShareOfAnswer = brandScoped(ShareOfAnswerTab);
const Trends = brandScoped(TrendsTab);

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
        { value: "mentions", label: "Mentions", icon: Users, Component: CommunityEngagement },
      ]}
    />
  );
}
