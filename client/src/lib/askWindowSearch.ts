// Pure data + matching for the Ask window (CommandPalette.tsx). Split out
// of that component so the matching rule itself - and the fixed NAV/
// QUICK_ACTIONS/SETTINGS_ENTRIES lists - can be unit tested without
// mounting cmdk, Radix Dialog, or any of the window's own React state.
//
// Matching used to be a single substring check against label+description+
// keywords, which is why typing "monitor" (a real page in this app) found
// NOTHING: no tab under Monitor has the word "monitor" in its own label,
// description or keywords - only in the SECTION it belongs to, which the
// old check never read. Two independent fixes, both here:
//   1. `matchesQuery` now folds `section` into the searched text too, so
//      "monitor" matches every tab filed under Monitor.
//   2. NAV gained one top-level row per spine stage (Monitor, Diagnose,
//      Act, Setup) - so "monitor" also matches Monitor ITSELF, not only
//      its tabs, the way a reader typing a page's own name expects.
// It's also token-based, not one substring: "add competitor" (two words)
// matches a row only when EVERY word is found somewhere in it, not the
// exact phrase - so word order and extra words don't defeat a match.
import {
  Home,
  FileText,
  Link2,
  Swords,
  History,
  Radar,
  AlertTriangle,
  Radio,
  Bug,
  PenLine,
  Search,
  Wrench,
  HelpCircle,
  Users,
  Building2,
  Shield,
  ScanEye,
  Settings,
  Activity,
  Stethoscope,
  SlidersHorizontal,
  Target,
} from "lucide-react";

export type Icon = React.ComponentType<{ className?: string }>;

/** "Go to" destinations - every authenticated route + each spine tab as a
 *  deep-link. Mirrors the spine tab definitions in pages/{monitor,diagnose,
 *  act,setup}.tsx and the routes in App.tsx - a `value` here must stay in
 *  sync with those SpineShell configs or a deep-link lands on the default
 *  tab. */
export type NavPath = "/" | "/report" | "/monitor" | "/diagnose" | "/act" | "/setup" | "/settings";

export type NavEntry = {
  section: string;
  label: string;
  description: string;
  to: NavPath;
  tab?: string;
  icon: Icon;
  brandScoped: boolean;
  keywords?: string;
};

export const NAV: NavEntry[] = [
  {
    section: "",
    label: "Dashboard",
    description: "Your daily AI visibility overview",
    to: "/",
    icon: Home,
    brandScoped: false,
    keywords: "home dashboard overview start",
  },
  {
    section: "",
    label: "Report",
    description: "Export and share your visibility results",
    to: "/report",
    icon: FileText,
    brandScoped: true,
    keywords: "proof export pdf share results",
  },

  // One row per spine stage, landing on that stage's own default tab (no
  // `tab` set) - distinct from the per-tab rows below, which deep-link
  // into a specific one.
  {
    section: "",
    label: "Monitor",
    description: "Citations, competitors, trends, and mentions",
    to: "/monitor",
    icon: Activity,
    brandScoped: true,
    keywords: "measure track watch",
  },
  {
    section: "",
    label: "Diagnose",
    description: "Hallucinations, GEO signals, and crawler access",
    to: "/diagnose",
    icon: Stethoscope,
    brandScoped: true,
    keywords: "issues problems accuracy",
  },
  {
    section: "",
    label: "Act",
    description: "Create content, keywords, and GEO tools",
    to: "/act",
    icon: Wrench,
    brandScoped: true,
    keywords: "fix improve write",
  },
  {
    section: "",
    label: "Setup",
    description: "Brands, fact sheet, and visibility checklist",
    to: "/setup",
    icon: SlidersHorizontal,
    brandScoped: false,
    keywords: "configure onboarding",
  },

  {
    section: "Monitor",
    label: "Citations",
    description: "See which AI prompts cite your brand",
    to: "/monitor",
    tab: "citations",
    icon: Link2,
    brandScoped: true,
    keywords: "cited prompts runs scan",
  },
  {
    section: "Monitor",
    label: "Competitors",
    description: "Compare citation performance against rivals",
    to: "/monitor",
    tab: "competitors",
    icon: Swords,
    brandScoped: true,
    keywords: "rivals share of voice leaderboard",
  },
  {
    section: "Monitor",
    label: "Trends",
    description: "Track visibility change over time",
    to: "/monitor",
    tab: "trends",
    icon: History,
    brandScoped: true,
    keywords: "history over time change",
  },
  {
    section: "Monitor",
    label: "Mentions",
    description: "Brand mentions found on Reddit and Hacker News",
    to: "/monitor",
    tab: "mentions",
    icon: Radar,
    brandScoped: true,
    keywords: "reddit hacker news detected",
  },

  {
    section: "Diagnose",
    label: "Hallucinations",
    description: "Find inaccurate claims AI models make about you",
    to: "/diagnose",
    tab: "hallucinations",
    icon: AlertTriangle,
    brandScoped: true,
    keywords: "inaccurate false claims accuracy",
  },
  {
    section: "Diagnose",
    label: "Signals",
    description: "GEO readiness: chunkability and schema",
    to: "/diagnose",
    tab: "signals",
    icon: Radio,
    brandScoped: true,
    keywords: "geo chunkability schema readiness",
  },
  {
    section: "Diagnose",
    label: "Crawler",
    description: "Check whether AI crawlers can reach your site",
    to: "/diagnose",
    tab: "crawler",
    icon: Bug,
    brandScoped: true,
    keywords: "robots gptbot permissions blocked",
  },
  {
    section: "Act",
    label: "Create",
    description: "Generate a new article",
    to: "/act",
    tab: "create",
    icon: PenLine,
    brandScoped: true,
    keywords: "generate content write article",
  },
  {
    section: "Act",
    label: "Library",
    description: "Your published articles and drafts",
    to: "/act",
    tab: "library",
    icon: FileText,
    brandScoped: true,
    keywords: "articles published drafts",
  },
  {
    section: "Act",
    label: "Keywords",
    description: "Research new keyword ideas",
    to: "/act",
    tab: "keywords",
    icon: Search,
    brandScoped: true,
    keywords: "research keyword ideas",
  },
  {
    section: "Act",
    label: "GEO Assets",
    description: "Wikipedia and bottom-of-funnel GEO tools",
    to: "/act",
    tab: "geo-assets",
    icon: Wrench,
    brandScoped: true,
    keywords: "tools wikipedia bofu",
  },
  {
    section: "Act",
    label: "FAQ",
    description: "Manage your FAQ answers",
    to: "/act",
    tab: "faq",
    icon: HelpCircle,
    brandScoped: true,
    keywords: "questions answers faq manager",
  },
  {
    section: "Act",
    label: "Community",
    description: "Reddit outreach and community posts",
    to: "/act",
    tab: "community",
    icon: Users,
    brandScoped: true,
    keywords: "reddit outreach aeo posts",
  },

  {
    section: "Setup",
    label: "Brands",
    description: "Manage your brand profile",
    to: "/setup",
    tab: "brands",
    icon: Building2,
    brandScoped: false,
    keywords: "brand profile create company",
  },
  {
    section: "Setup",
    label: "Fact Sheet",
    description: "Your brand's source-of-truth facts",
    to: "/setup",
    tab: "fact-sheet",
    icon: Shield,
    brandScoped: true,
    keywords: "facts scrape source of truth",
  },
  {
    section: "Setup",
    label: "Visibility Checklist",
    description: "Setup tasks and their progress",
    to: "/setup",
    tab: "visibility",
    icon: ScanEye,
    brandScoped: true,
    keywords: "checklist tasks progress",
  },

  {
    section: "",
    label: "Account settings",
    description: "Profile, password, and preferences",
    to: "/settings",
    icon: Settings,
    brandScoped: false,
    keywords: "profile password account preferences",
  },
];

export type QuickAction = {
  label: string;
  description: string;
  icon: Icon;
  to: "/monitor" | "/act";
  tab: string;
  ptab?: string;
  keywords?: string;
};

// Every quick action only navigates to where the change happens - none of
// them mutate from inside this window.
export const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Add prompt",
    description: "Create a new tracked prompt",
    icon: Target,
    to: "/monitor",
    tab: "citations",
    ptab: "prompts",
    keywords: "track new question",
  },
  {
    label: "Add competitor",
    description: "Track a new competitor",
    icon: Swords,
    to: "/monitor",
    tab: "competitors",
    keywords: "rival",
  },
  {
    label: "New article",
    description: "Start a new article draft",
    icon: PenLine,
    to: "/act",
    tab: "create",
    keywords: "write generate content",
  },
  {
    label: "Scan mentions",
    description: "Look for new brand mentions",
    icon: Radar,
    to: "/monitor",
    tab: "mentions",
    keywords: "reddit hacker news scan",
  },
];

export type SettingsEntry = { id: string; label: string; description: string };

export const SETTINGS_ENTRIES: SettingsEntry[] = [
  { id: "profile", label: "Profile", description: "Name and timezone" },
  { id: "password", label: "Password", description: "Change your password" },
  { id: "billing", label: "Plan & billing", description: "Your plan and payment method" },
  { id: "invoices", label: "Invoices", description: "Past invoices and receipts" },
];

/** True when every word in `query` is found somewhere in `haystack`
 *  (case-insensitive substring per word - not a full-phrase match, so word
 *  order and extra words don't defeat it). Empty/whitespace-only query
 *  matches everything. */
export function containsAllWords(haystack: string, query: string): boolean {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const lower = haystack.toLowerCase();
  return words.every((w) => lower.includes(w));
}

/** Matches a NAV/QUICK_ACTIONS/SETTINGS_ENTRIES-shaped row against a typed
 *  query, folding section into the searchable text (see this file's header
 *  for why that's the fix for "monitor" finding nothing). */
export function matchesQuery(
  query: string,
  entry: { label: string; description?: string; keywords?: string; section?: string },
): boolean {
  const haystack = [entry.label, entry.description, entry.keywords, entry.section]
    .filter(Boolean)
    .join(" ");
  return containsAllWords(haystack, query);
}
