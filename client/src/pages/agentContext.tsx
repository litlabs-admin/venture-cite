// Business context (business-context.md) - the full-page editor behind the
// Ask top bar's "Business context" button and the "What I know" drawer's
// "Open brief" / "Manage memory and sources" links. Same route shell shape
// Trakkr's own S6-S9 use: an "Agent" breadcrumb, a page title, "Back to
// Agent" at the right, and a tab strip with the brand name at its far end.
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, Inbox } from "lucide-react";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { cn } from "@/lib/utils";
import { BusinessBriefTab } from "@/components/ask/context/BusinessBriefTab";
import { MemoryTab } from "@/components/ask/context/MemoryTab";
import { PreferencesTab } from "@/components/ask/context/PreferencesTab";
import { ComingSoonPanel } from "@/components/ask/context/ComingSoonPanel";

const TABS = [
  { value: "brief", label: "Business brief" },
  { value: "memory", label: "Memory" },
  { value: "preferences", label: "Your preferences" },
  { value: "handoffs", label: "Handoffs" },
] as const;
type TabValue = (typeof TABS)[number]["value"];

function isTabValue(v: unknown): v is TabValue {
  return typeof v === "string" && TABS.some((t) => t.value === v);
}

export default function AgentContextPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const { selectedBrandId, selectedBrand } = useBrandSelection();

  const rawTab = (search as Record<string, unknown>).tab;
  const activeTab: TabValue = isTabValue(rawTab) ? rawTab : "brief";

  const setTab = (tab: TabValue) => {
    navigate({ to: "/agent/context", search: { ...search, tab }, replace: true });
  };

  const brandName = selectedBrand?.name ?? "your brand";

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-caption text-vc-tertiary">Agent</p>
        <Link
          to="/agent"
          className="flex items-center gap-1.5 text-caption text-vc-secondary transition-colors hover:text-vc-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Agent
        </Link>
      </div>
      <h1 className="mb-6 text-page font-semibold text-vc-primary">Business context</h1>

      <div className="mb-6 flex items-center justify-between border-b border-vc-default">
        <nav className="-mb-px flex gap-5" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.value}
              onClick={() => setTab(tab.value)}
              className={cn(
                "border-b-2 px-0.5 py-2.5 text-caption font-medium transition-colors",
                activeTab === tab.value
                  ? "border-vc-accent text-vc-accent"
                  : "border-transparent text-vc-tertiary hover:text-vc-secondary",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <span className="pb-2.5 text-caption text-vc-tertiary">{brandName}</span>
      </div>

      {/* Cross-fade between tabs - a quiet beat on every switch rather than
          an instant content swap. key= forces remount so the animation
          replays every time, and each tab keeps its own scroll position. */}
      <div key={activeTab} className="animate-fade-in motion-reduce:animate-none">
        {activeTab === "brief" && <BusinessBriefTab brandId={selectedBrandId ?? null} />}
        {activeTab === "memory" && <MemoryTab brandId={selectedBrandId ?? null} />}
        {activeTab === "preferences" && <PreferencesTab brandId={selectedBrandId ?? null} />}
        {activeTab === "handoffs" && (
          <ComingSoonPanel
            icon={Inbox}
            title="Handoffs are on the way"
            description="Bring the brief, evidence, drafts, decisions and owner together for the next person. Not built yet."
          />
        )}
      </div>
    </div>
  );
}
