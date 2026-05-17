import { lazy } from "react";
import { AlertTriangle, Award, Radio, Bug, Lightbulb } from "lucide-react";
import SpineShell from "@/components/SpineShell";
import { brandScoped } from "@/components/BrandScopedTab";
import HallucinationsTab from "@/components/intelligence/HallucinationsTab";
import CitationQualityTab from "@/components/intelligence/CitationQualityTab";
import RecommendationsPanel from "@/components/dashboard/RecommendationsPanel";

// "What's wrong & why?" — Hallucinations and Citation Quality are the
// diagnostic halves of the dissolved ai-intelligence page; Signals and
// Crawler are the technical readiness checks. Issues is the deterministic
// recommendations engine (replacing the cut geo-opportunities page — which
// was hardcoded tips + a stub Content-Ideas tab); Phase 8 enriches it with
// the alert-driven change feed.
const GeoSignals = lazy(() => import("@/pages/geo-signals"));
const CrawlerCheck = lazy(() => import("@/pages/crawler-check"));

const Hallucinations = brandScoped(HallucinationsTab);
const CitationQuality = brandScoped(CitationQualityTab);

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
        {
          value: "citation-quality",
          label: "Citation Quality",
          icon: Award,
          Component: CitationQuality,
        },
        { value: "signals", label: "Signals", icon: Radio, Component: GeoSignals },
        { value: "crawler", label: "Crawler", icon: Bug, Component: CrawlerCheck },
        { value: "issues", label: "Issues", icon: Lightbulb, Component: RecommendationsPanel },
      ]}
    />
  );
}
