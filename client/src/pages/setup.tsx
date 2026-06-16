import { lazy } from "react";
import { Building2, Shield, ScanEye } from "lucide-react";
import SpineShell from "@/components/SpineShell";

// Phase 0 scaffold: embeds existing pages unchanged. A real Prompts tab
// (prompt portfolio) is added in Phase 6.
const Brands = lazy(() => import("@/pages/brands"));
const BrandFactSheet = lazy(() => import("@/pages/brand-fact-sheet"));
const AIVisibility = lazy(() => import("@/pages/ai-visibility"));

export default function Setup() {
  return (
    <SpineShell
      defaultTab="brands"
      tabs={[
        {
          value: "brands",
          label: "Brands",
          icon: Building2,
          Component: Brands,
          description:
            "Set up the brand you want to track: its name, website, and core details. Everything else in VentureCite hangs off this.",
        },
        {
          value: "fact-sheet",
          label: "Fact Sheet",
          icon: Shield,
          Component: BrandFactSheet,
          description:
            "Your brand's source-of-truth facts, scraped from your website. Used to detect AI hallucinations and to ground generated content.",
        },
        {
          value: "visibility",
          label: "Visibility Checklist",
          icon: ScanEye,
          Component: AIVisibility,
          description:
            "Step-by-step actions to increase your visibility across AI engines. Some steps happen inside VentureCite; others (publishing articles, earning high-authority placements, dev/website tasks) happen off-platform, so mark those done with the checkboxes to track your own progress.",
        },
      ]}
    />
  );
}
