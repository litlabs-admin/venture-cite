import { useEffect, useMemo, useState } from "react";
import { FileText, LayoutDashboard, Megaphone, Search, SquareCode, UserRound } from "lucide-react";
import { Board } from "./internal/Board";
import { Dashboard } from "./internal/Dashboard";
import {
  SEED_AEO,
  SEED_BEN,
  SEED_CONTENT,
  SEED_ENGINEERING_IMPORTED,
  SEED_MARKETING,
} from "./internal/seedTasks";
import type { BoardId, Ticket } from "./internal/types";

// ─── Internal workspace ──────────────────────────────────────────────────────
// A private workspace for the team: a KPI dashboard plus five kanban boards.
//
// PUBLIC: this page has no authentication gate. Anyone with the URL can read
// and edit every board, and can read the dashboard. That is a deliberate
// choice, carried over from the original board. It is why /api/internal/kpis
// returns aggregate counts only and never per-user rows - see that route.
//
// STORAGE: each board is its own `system_state` row (server/routes/board.ts).
// Every visitor reads and writes the same rows, so a change is permanent and
// shared. Boards save independently, so editing Marketing cannot clobber
// Engineering.
//
// The engineering seed below comes from a full read of the codebase on
// 2026-08-10. Each seeded ticket names the file that proves it. Nothing there
// is a guess. The other four boards are seeded from "Venture Task Tracker.xlsx"
// (see internal/seedTasks.ts).

type ViewId = "dashboard" | BoardId;

const NAV: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "engineering", label: "Engineering tasks", icon: SquareCode },
  { id: "marketing", label: "Marketing", icon: Megaphone },
  { id: "content", label: "Content", icon: FileText },
  { id: "aeo", label: "AEO/GEO/SEO", icon: Search },
  { id: "ben", label: "Ben's Personal Content", icon: UserRound },
];

const BLURB: Record<BoardId, string> = {
  engineering:
    "Product and platform work. The seeded tickets came from a full codebase read and each names the file that proves it; the spreadsheet's engineering rows are mixed in and carry a brand tag.",
  marketing:
    "Campaigns, ads, outreach, launch activity and lead follow-up across all three brands.",
  content: "Articles, video, creatives, case studies and the content calendar.",
  aeo: "Answer-engine, generative-engine and search visibility work — the GEO outreach and citation-tracking thread.",
  ben: "Ben's personal brand: topic plans, scripts, reels and thought-leadership posts.",
};

let seedCounter = 0;
function seed(
  t: Pick<Ticket, "title" | "detail" | "kind" | "weight" | "area" | "evidence"> & {
    column?: Ticket["column"];
  },
): Ticket {
  seedCounter += 1;
  return {
    ...t,
    id: `seed-${seedCounter}`,
    order: seedCounter,
    column: t.column ?? "backlog",
    brand: "",
    assignee: "",
    status: "",
    link: "",
    notes: "",
  };
}

// ─── The engineering seed ────────────────────────────────────────────────────
const SEED_AUDIT: Ticket[] = [
  seed({
    title: "Explain one question, end to end",
    detail:
      "Today diagnose.tsx is a 51 line shell with three tabs. Build a real per-question report: the score, the best position, which models answered, the blockers, the fixes, and the sources. Each fix must create a task.",
    kind: "feature",
    weight: "high",
    area: "Diagnose",
    evidence: "client/src/pages/diagnose.tsx, 51 lines",
  }),
  seed({
    title: "Add presence, best position and share of first place",
    detail:
      "One visibility number hides the shape of the result. Presence counts the answers that name the brand at all. Share of first place counts the answers that name the brand first. Both are cheap, because the run already stores each position.",
    kind: "upgrade",
    weight: "high",
    area: "Measurement",
    evidence: "server/lib computeVisibilityScore",
    column: "doing",
  }),
  seed({
    title: "Group prompts by audience and buying stage",
    detail:
      "One brand wide score hides a wide spread between buyer types. Group each prompt under an audience and a stage. Show the score per audience.",
    kind: "feature",
    weight: "medium",
    area: "Prompts",
    evidence: "server/routes/prompts.ts",
    column: "doing",
  }),
  seed({
    title: "Build the pivot view",
    detail:
      "Let a user choose the rows, for example model or prompt. Let a user choose the measures, for example visibility, presence, average rank and mentions. Export the table as CSV.",
    kind: "feature",
    weight: "medium",
    area: "Reporting",
    evidence: "no equivalent page exists",
    column: "doing",
  }),
  seed({
    title: "Rank rivals with trend, head to head and win rate",
    detail:
      "The competitors page lists rivals. It shows no movement, no duel record and no win rate. The run data already holds each position, so the arithmetic is available.",
    kind: "upgrade",
    weight: "high",
    area: "Competitors",
    evidence: "client/src/pages/competitors.tsx",
  }),
  seed({
    title: "Split citations into sources, queries and gaps",
    detail:
      "The citations page shows one list. Add a source view, a query view, and a gap view that lists publishers who cite a rival but not us. The gap view is the one that creates outreach work.",
    kind: "upgrade",
    weight: "high",
    area: "Citations",
    evidence: "client/src/pages/citations.tsx",
  }),
  seed({
    title: "Turn findings into a work queue",
    detail:
      "Wire agent_tasks to a page. Give each task a state: found, planned, measuring, earned. Let diagnose, site health and the citation gap view all write into it. This closes the loop between a finding and a fix.",
    kind: "feature",
    weight: "high",
    area: "Actions",
    evidence: "agent_tasks exists with no route",
  }),
  seed({
    title: "Let a rule watch and act without us",
    detail:
      "Build a rule with four parts: what to watch, what to check, what to do, and who to tell. Add a permission ladder, so a rule can notify only, or draft, or apply after approval. Nothing runs until a person turns it on.",
    kind: "feature",
    weight: "medium",
    area: "Automations",
    evidence: "only weekly_catchup exists",
  }),
  seed({
    title: "Group articles into campaigns and track the live ones",
    detail:
      "Articles stand alone today. Group them under a campaign. Add a live view that shows which published article now gets cited. That is the only proof the work paid off.",
    kind: "upgrade",
    weight: "medium",
    area: "Content",
    evidence: "server/routes/articles.ts",
  }),
  seed({
    title: "Count real AI crawler visits",
    detail:
      "The product checks robots.txt for permission. It never counts a visit. Add an endpoint that accepts a request log from the customer site, match the user agent against the known AI crawlers, and count each hit. This is the only honest source for crawler data.",
    kind: "feature",
    weight: "high",
    area: "Traffic",
    evidence: "server/routes/geoSignals.ts, robots check only",
    column: "doing",
  }),
  seed({
    title: "Connect Google Analytics and Search Console",
    detail:
      "The product cannot show a visit from an AI assistant, because no analytics account is connected. Add both connections. Show the search numbers beside the AI numbers.",
    kind: "feature",
    weight: "medium",
    area: "Traffic",
    evidence: "no GA or GSC integration exists",
  }),
  seed({
    title: "Serve AI crawlers a clean version of a page",
    detail:
      "Most AI crawlers do not run JavaScript. Detect the crawler at the edge. Serve clean structure and schema. Keep the normal page for a human visitor. Log every crawler request.",
    kind: "feature",
    weight: "low",
    area: "Traffic",
    evidence: "no equivalent exists",
    column: "doing",
  }),
  seed({
    title: "Make every view shareable with a link",
    detail:
      "A filter, a tab and a sort do not appear in the URL today. A user cannot send a colleague the exact view. Put the tab and the main filters into the query string.",
    kind: "upgrade",
    weight: "medium",
    area: "Platform",
    evidence: "client routes carry no view state",
    column: "doing",
  }),
  seed({
    title: "Publish a read API and an MCP server",
    detail:
      "Customers cannot reach their own data from outside the app. Publish a documented read API. Add an MCP server, so a customer can query the data from Claude or Cursor.",
    kind: "feature",
    weight: "medium",
    area: "Platform",
    evidence: "no public API exists",
  }),
  seed({
    title: "Add teams and seats",
    detail:
      "One account equals one person today. Agencies need many seats and a role for each seat. This blocks every agency plan feature.",
    kind: "feature",
    weight: "medium",
    area: "Account",
    evidence: "no team table in shared/schema.ts",
  }),
  seed({
    title: "Gate features, not only quotas",
    detail:
      "Billing checks quantity only, for example the article count and the brand count. No feature is gated. A plan cannot sell a capability today, only a volume.",
    kind: "upgrade",
    weight: "medium",
    area: "Billing",
    evidence: "server/routes/billing.ts, quota checks only",
    column: "doing",
  }),
  seed({
    title: "Send events to other systems",
    detail:
      "Buffer is the only outbound connection. Add outbound webhooks first, because one webhook reaches Zapier, Slack and every task tracker at once.",
    kind: "feature",
    weight: "low",
    area: "Integrations",
    evidence: "server/routes/buffer.ts is the only connector",
    column: "doing",
  }),
];

const SEED_ENGINEERING: Ticket[] = [...SEED_AUDIT, ...SEED_ENGINEERING_IMPORTED];

const SEEDS: Record<BoardId, Ticket[]> = {
  engineering: SEED_ENGINEERING,
  marketing: SEED_MARKETING,
  content: SEED_CONTENT,
  aeo: SEED_AEO,
  ben: SEED_BEN,
};

const VIEW_KEY = "internal-page-view";

export default function InternalPage() {
  // Remembering the tab means a refresh does not throw you back to Dashboard
  // mid-edit. Guarded because a stored value can outlive a renamed tab.
  const [view, setView] = useState<ViewId>(() => {
    if (typeof window === "undefined") return "dashboard";
    const saved = window.localStorage.getItem(VIEW_KEY);
    return NAV.some((n) => n.id === saved) ? (saved as ViewId) : "dashboard";
  });

  useEffect(() => {
    window.localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  const active = useMemo(() => NAV.find((n) => n.id === view) ?? NAV[0], [view]);

  return (
    <div className="flex h-screen bg-vc-page">
      <nav className="flex w-14 shrink-0 flex-col border-r border-vc-default bg-vc-muted lg:w-60">
        <div className="border-b border-vc-default px-3 py-4 lg:px-4">
          <span className="hidden text-sm font-semibold text-vc-primary lg:block">
            Venture internal
          </span>
          <span className="block text-center text-sm font-semibold text-vc-primary lg:hidden">
            V
          </span>
        </div>

        <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = item.id === view;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                title={item.label}
                aria-current={on ? "page" : undefined}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                  on
                    ? "bg-vc-accent-subtle font-medium text-vc-accent"
                    : "text-vc-secondary hover:bg-vc-surface hover:text-vc-primary"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden truncate lg:block">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="hidden border-t border-vc-default px-4 py-3 lg:block">
          <p className="text-[11px] leading-relaxed text-vc-tertiary">
            Shared and public. Every edit is saved for everyone.
          </p>
        </div>
      </nav>

      <main className="min-w-0 flex-1 overflow-hidden">
        {view === "dashboard" ? (
          <Dashboard />
        ) : (
          <Board
            // Remounting per board keeps each board's local state (search,
            // filters, drag) from leaking into the next one.
            key={view}
            boardId={view}
            title={active.label}
            blurb={BLURB[view]}
            seed={SEEDS[view]}
            newKind={view === "engineering" ? "feature" : "task"}
          />
        )}
      </main>
    </div>
  );
}
