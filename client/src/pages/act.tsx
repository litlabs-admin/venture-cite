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
        {
          value: "create",
          label: "Create",
          icon: PenLine,
          Component: Content,
          description: "Generate AI-ready content drafts optimized to get cited by AI engines.",
        },
        {
          value: "library",
          label: "Library",
          icon: FileText,
          Component: Articles,
          description: "All your generated and saved articles in one place.",
        },
        {
          value: "keywords",
          label: "Keywords",
          icon: Search,
          Component: KeywordResearch,
          description:
            "Research the questions and keywords your audience asks AI engines, so you can target them in your content.",
        },
        {
          value: "geo-assets",
          label: "GEO Assets",
          icon: Wrench,
          Component: GeoTools,
          description:
            "GEO building blocks: structured data, schema, and other assets that make your site AI-readable.",
        },
        {
          value: "faq",
          label: "FAQ",
          icon: HelpCircle,
          Component: FaqManager,
          description:
            "Create and manage FAQ content AI engines can quote directly. Generated FAQs appear in Manage FAQs.",
        },
        {
          value: "community",
          label: "Community",
          icon: Users,
          Component: CommunityEngagement,
          description:
            "Draft and track authentic posts for community platforms. Posts on Reddit and Hacker News are among the most frequently cited sources by AI engines, so engaging there is one of the highest-impact GEO moves, and more platforms are coming soon.",
        },
      ]}
    />
  );
}
