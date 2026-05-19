import { lazy } from "react";
import { FileText } from "lucide-react";
import { Redirect, useSearch } from "wouter";
import SpineShell from "@/components/SpineShell";

// /act consolidation complete (2a + 2b): the per-type silos collapsed to
// ONE unified Production pipeline — everything you author (articles, FAQs,
// BOFU, community posts) in one status-keyed list + one adaptive create
// panel. Listicle/Wikipedia were placement OPPORTUNITIES you don't author;
// their detection moved to /diagnose?tab=coverage in 2b and the authored
// BOFU half folded into Production. /act is now a single surface.
//
// Legacy deep-links: content/create/library/keywords/faq/community still
// alias to the one production tab (App.tsx 301s, recommendationsEngine
// CTAs, the Cmd-K palette, and spineStages titling all resolve; Production
// reads the original ?tab to pre-filter its type). The two retired
// asset-surface values (geo-assets/off-site) now 301 cross-stage to the
// relocated Coverage detection surface in /diagnose, preserving brandId.
const Production = lazy(() => import("@/components/act/Production"));

const LEGACY_COVERAGE_TABS = new Set(["geo-assets", "off-site"]);

export default function Act() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  if (LEGACY_COVERAGE_TABS.has(params.get("tab") ?? "")) {
    params.set("tab", "coverage");
    return <Redirect to={`/diagnose?${params.toString()}`} replace />;
  }
  return (
    <SpineShell
      defaultTab="production"
      tabs={[{ value: "production", label: "Production", icon: FileText, Component: Production }]}
      aliases={{
        content: "production",
        create: "production",
        library: "production",
        keywords: "production",
        faq: "production",
        community: "production",
      }}
    />
  );
}
