import { lazy } from "react";
import { AlertTriangle, Radio, Bug } from "lucide-react";
import SpineShell from "@/components/SpineShell";
import { brandScoped } from "@/components/BrandScopedTab";
import HallucinationsTab from "@/components/intelligence/HallucinationsTab";

// "What's wrong & why?" — Hallucinations is the diagnostic half of the
// dissolved ai-intelligence page (its Citation Quality tab was removed
// because the citation_quality table is dead — the server synthesized the
// authority/relevance/recency scores, so the surface could not be
// defended); Signals and Crawler are the technical readiness checks. The
// Issues tab was retired — recommendations live on the Command Center
// (Pulse) as the single canonical worklist surface.
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
      ]}
    />
  );
}
