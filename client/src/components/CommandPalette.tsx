import { useState } from "react";
import { useLocation } from "wouter";
import {
  Home,
  FileText,
  BarChart3,
  Link2,
  Swords,
  History,
  Radar,
  AlertTriangle,
  Radio,
  Bug,
  Lightbulb,
  PenLine,
  Search,
  Target,
  HelpCircle,
  Users,
  Building2,
  Shield,
  ScanEye,
  Settings,
  Sparkles,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { DialogTitle } from "@/components/ui/dialog";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { openChatbotPrompt } from "@/lib/openChatbotPrompt";

// ─── Cmd-K command palette ───────────────────────────────────────────────────
// Global keyboard-first switcher. Two intents:
//   Go to — every authenticated route + each spine tab as a deep-link
//   Ask   — hand the typed query to the assistant (openChatbotPrompt)
//
// The Cmd/Ctrl+K listener that toggles `open` lives in AppShell so the palette
// is one keystroke away from every authenticated route. This component is pure
// UI: it never owns the shortcut. No in-palette mutations by design — Act items
// route to where the action happens, they don't fire side effects here.
//
// The nav table mirrors the spine tab definitions in pages/{monitor,diagnose,
// act,setup}.tsx and the routes in App.tsx. Tab `value`s must stay in sync
// with those SpineShell configs or a deep-link lands on the default tab.

type Icon = React.ComponentType<{ className?: string }>;

type NavEntry = {
  section: string;
  label: string;
  href: string;
  icon: Icon;
  brandScoped: boolean;
  keywords?: string;
};

const NAV: NavEntry[] = [
  {
    section: "",
    label: "Command Center",
    href: "/",
    icon: Home,
    brandScoped: false,
    keywords: "home dashboard overview start",
  },
  {
    section: "",
    label: "Report",
    href: "/report",
    icon: FileText,
    brandScoped: true,
    keywords: "proof export pdf share results",
  },

  {
    section: "Monitor",
    label: "Overview",
    href: "/monitor?tab=overview",
    icon: BarChart3,
    brandScoped: true,
    keywords: "analytics visibility report",
  },
  {
    section: "Monitor",
    label: "Citations",
    href: "/monitor?tab=citations",
    icon: Link2,
    brandScoped: true,
    keywords: "cited prompts runs scan",
  },
  {
    section: "Monitor",
    label: "Competitors",
    href: "/monitor?tab=competitors",
    icon: Swords,
    brandScoped: true,
    keywords: "rivals share of voice leaderboard",
  },
  {
    section: "Monitor",
    label: "Trends",
    href: "/monitor?tab=trends",
    icon: History,
    brandScoped: true,
    keywords: "history over time change",
  },
  {
    section: "Monitor",
    label: "Mentions",
    href: "/monitor?tab=mentions",
    icon: Radar,
    brandScoped: true,
    keywords: "reddit hacker news detected",
  },

  {
    section: "Diagnose",
    label: "Hallucinations",
    href: "/diagnose?tab=hallucinations",
    icon: AlertTriangle,
    brandScoped: true,
    keywords: "inaccurate false claims accuracy",
  },
  {
    section: "Diagnose",
    label: "Coverage",
    href: "/diagnose?tab=coverage",
    icon: Target,
    brandScoped: true,
    keywords: "listicles wikipedia placements best of missing",
  },
  {
    section: "Diagnose",
    label: "Signals",
    href: "/diagnose?tab=signals",
    icon: Radio,
    brandScoped: true,
    keywords: "geo chunkability schema readiness",
  },
  {
    section: "Diagnose",
    label: "Crawler",
    href: "/diagnose?tab=crawler",
    icon: Bug,
    brandScoped: true,
    keywords: "robots gptbot permissions blocked",
  },
  {
    section: "Diagnose",
    label: "Issues",
    href: "/diagnose?tab=issues",
    icon: Lightbulb,
    brandScoped: true,
    keywords: "recommendations next steps",
  },

  {
    section: "Act",
    label: "Create",
    href: "/act?tab=create",
    icon: PenLine,
    brandScoped: true,
    keywords: "generate content write article",
  },
  {
    section: "Act",
    label: "Library",
    href: "/act?tab=library",
    icon: FileText,
    brandScoped: true,
    keywords: "articles published drafts",
  },
  {
    section: "Act",
    label: "Keywords",
    href: "/act?tab=keywords",
    icon: Search,
    brandScoped: true,
    keywords: "research keyword ideas",
  },
  {
    section: "Act",
    label: "FAQ",
    href: "/act?tab=faq",
    icon: HelpCircle,
    brandScoped: true,
    keywords: "questions answers faq manager",
  },
  {
    section: "Act",
    label: "Community",
    href: "/act?tab=community",
    icon: Users,
    brandScoped: true,
    keywords: "reddit outreach aeo posts",
  },

  {
    section: "Setup",
    label: "Brands",
    href: "/setup?tab=brands",
    icon: Building2,
    brandScoped: false,
    keywords: "brand profile create company",
  },
  {
    section: "Setup",
    label: "Fact Sheet",
    href: "/setup?tab=fact-sheet",
    icon: Shield,
    brandScoped: true,
    keywords: "facts scrape source of truth",
  },
  {
    section: "Setup",
    label: "Visibility Checklist",
    href: "/setup?tab=visibility",
    icon: ScanEye,
    brandScoped: true,
    keywords: "checklist tasks progress",
  },

  {
    section: "",
    label: "Account settings",
    href: "/settings",
    icon: Settings,
    brandScoped: false,
    keywords: "profile password account preferences",
  },
];

/** Carry the active brand on brand-scoped deep-links so the selection stays
 *  sticky when navigating from the palette. */
function withBrand(href: string, brandId: string): string {
  if (!brandId) return href;
  const [path, qs = ""] = href.split("?");
  const params = new URLSearchParams(qs);
  if (!params.get("brandId")) params.set("brandId", brandId);
  return `${path}?${params.toString()}`;
}

export default function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, setLocation] = useLocation();
  const { selectedBrandId } = useBrandSelection();
  const [query, setQuery] = useState("");

  function close() {
    onOpenChange(false);
    // Clear after the dialog's close transition so the list doesn't flicker
    // back to "all" while it fades out.
    setTimeout(() => setQuery(""), 150);
  }

  function go(entry: NavEntry) {
    setLocation(entry.brandScoped ? withBrand(entry.href, selectedBrandId) : entry.href);
    close();
  }

  function ask() {
    const q = query.trim();
    if (!q) return;
    openChatbotPrompt(q);
    close();
  }

  const trimmed = query.trim();
  const sections = Array.from(new Set(NAV.map((n) => n.section)));

  return (
    <CommandDialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogTitle className="sr-only">Command palette</DialogTitle>
      <CommandInput placeholder="Search or ask…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No matches. Press Enter on “Ask” to ask the assistant.</CommandEmpty>

        {sections.map((section) => {
          const entries = NAV.filter((n) => n.section === section);
          return (
            <CommandGroup
              key={section || "general"}
              heading={section ? `Go to · ${section}` : "Go to"}
            >
              {entries.map((entry) => {
                const I = entry.icon;
                return (
                  <CommandItem
                    key={entry.href}
                    value={`${section} ${entry.label} ${entry.keywords ?? ""}`}
                    onSelect={() => go(entry)}
                    className="cursor-pointer"
                  >
                    <I className="text-muted-foreground" />
                    <span>{entry.label}</span>
                    {section && (
                      <span className="ml-auto text-xs text-muted-foreground">{section}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}

        {trimmed !== "" && (
          <CommandGroup heading="Ask">
            <CommandItem
              // Value embeds the live query so cmdk's filter always keeps this
              // row visible while the user is typing a question.
              value={`ask ${query}`}
              onSelect={ask}
              className="cursor-pointer"
            >
              <Sparkles className="text-muted-foreground" />
              <span className="truncate">
                Ask the assistant: <span className="text-foreground">“{trimmed}”</span>
              </span>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
