import { lazy } from "react";
import { PenLine, FileText, Search, Wrench, HelpCircle, Users } from "lucide-react";
import SpineShell from "@/components/SpineShell";

// Phase 0 scaffold: embeds existing pages unchanged. Phase 5 decomposes
// geo-tools into GEO Assets + folds its FAQ tab into the canonical FAQ editor,
// and co-locates community with detected mentions.
const Content = lazy(() => import("@/pages/content"));
const Articles = lazy(() => import("@/pages/articles"));
const KeywordResearch = lazy(() => import("@/pages/keyword-research"));
const GeoTools = lazy(() => import("@/pages/geo-tools"));
const FaqManager = lazy(() => import("@/pages/faq-manager"));
const CommunityEngagement = lazy(() => import("@/pages/community-engagement"));

export default function Act() {
  return (
    <SpineShell
      defaultTab="create"
      tabs={[
        { value: "create", label: "Create", icon: PenLine, Component: Content },
        { value: "library", label: "Library", icon: FileText, Component: Articles },
        { value: "keywords", label: "Keywords", icon: Search, Component: KeywordResearch },
        { value: "geo-assets", label: "GEO Assets", icon: Wrench, Component: GeoTools },
        { value: "faq", label: "FAQ", icon: HelpCircle, Component: FaqManager },
        { value: "community", label: "Community", icon: Users, Component: CommunityEngagement },
      ]}
    />
  );
}
