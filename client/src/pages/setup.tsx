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
        { value: "brands", label: "Brands", icon: Building2, Component: Brands },
        { value: "fact-sheet", label: "Fact Sheet", icon: Shield, Component: BrandFactSheet },
        {
          value: "visibility",
          label: "Visibility Checklist",
          icon: ScanEye,
          Component: AIVisibility,
        },
      ]}
    />
  );
}
