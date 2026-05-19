import { lazy } from "react";
import { AlertTriangle, Radio, Bug, Lightbulb } from "lucide-react";
import SpineShell from "@/components/SpineShell";
import { brandScoped } from "@/components/BrandScopedTab";
import HallucinationsTab from "@/components/intelligence/HallucinationsTab";
import RecommendationsPanel from "@/components/dashboard/RecommendationsPanel";

// "What's wrong & why?" — Hallucinations is the diagnostic half of the
// dissolved ai-intelligence page (its Citation Quality tab was removed
// because the citation_quality table is dead — the server synthesized the
// authority/relevance/recency scores, so the surface could not be
// defended); Signals and Crawler are the technical readiness checks. Issues
// is the deterministic recommendations engine (replacing the cut
// geo-opportunities page — which was hardcoded tips + a stub Content-Ideas
// tab); Phase 8 enriches it with the alert-driven change feed.
const GeoSignals = lazy(() => import("@/pages/geo-signals"));
const CrawlerCheck = lazy(() => import("@/pages/crawler-check"));

const Hallucinations = brandScoped(HallucinationsTab);

export default function Diagnose() {
  return (
    <SpineShell
      defaultTab="hallucinations"
      tabs={[
        {
          value: "hallucinations",
          label: "Hallucinations",
          icon: AlertTriangle,
          Component: Hallucinations,
        },
        { value: "signals", label: "Signals", icon: Radio, Component: GeoSignals },
        { value: "crawler", label: "Crawler", icon: Bug, Component: CrawlerCheck },
        { value: "issues", label: "Issues", icon: Lightbulb, Component: RecommendationsPanel },
      ]}
    />
  );
}
