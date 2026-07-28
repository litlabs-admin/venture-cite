// Copy, hrefs, and stagger-delay constants verified against
// _reference/index.html (lines 682-896) and, for behavior not visible in
// the closed-menu DOM snapshot, _reference/assets/TrakkrNav-JAUeEuWq.js and
// _reference/assets/nav-data-DcRPnYz_.js.

export type NavItem = {
  name: string;
  href: string;
  description: string;
  iconSlug?: string; // maps to a lucide glyph via NavItemIcon; only rendered while a mega-menu is open
  iconSrc?: string; // real asset override — takes precedence over iconSlug when present
  external?: boolean;
};

// Product mega-menu, left column ("Features"). Header delay 40ms; items
// stagger at 60 + index*30ms (60/90/120/150/180).
export const productFeatures: NavItem[] = [
  {
    name: "Citations",
    href: "#platform-section",
    description: "See what AI reads about you",
    iconSlug: "citations",
  },
  {
    name: "Share of answer",
    href: "#platform-section",
    description: "How much of the answer you own",
    iconSlug: "perception",
  },
  {
    name: "Competitors",
    href: "#revenue-section",
    description: "Benchmark against rivals",
    iconSlug: "competitors",
  },
  {
    name: "Content",
    href: "#philosophy-section",
    description: "Generate citation-ready pages",
    iconSlug: "workflows",
  },
  {
    name: "GEO signals",
    href: "#philosophy-section",
    description: "Score what engines reward",
    iconSlug: "agent",
  },
];

// Product mega-menu, right column top ("Solutions"). Header delay 80ms;
// items stagger at 120 + index*30ms (120/150/180).
export const productSolutions: NavItem[] = [
  { name: "Startups", href: "/register", description: "Beat the giants" },
  { name: "Agencies", href: "/register", description: "Multi-client management" },
  { name: "Enterprise", href: "/register", description: "Security and scale" },
];

// Product mega-menu, right column bottom ("Tools"). Header delay 160ms;
// items stagger at 200 + index*30ms (200/230/260/290).
export const productTools: NavItem[] = [
  {
    name: "Crawler check",
    href: "#platform-section",
    description: "See your site the way AI does",
  },
  {
    name: "GEO glossary",
    href: "/glossary",
    description: "The vocabulary, defined",
  },
  {
    name: "Share-of-answer report",
    href: "#revenue-section",
    description: "Weekly, by engine and topic",
  },
  {
    name: "FAQ optimization",
    href: "#philosophy-section",
    description: "Answer the questions engines ask",
  },
];

// Resources mega-menu featured tile. Illustration reused from the source's
// asset set (a generic isometric book, no third-party branding on it).
export const resourcesFeatured: NavItem = {
  name: "GEO glossary",
  href: "/glossary",
  description: "Every term in generative engine optimization, defined",
  iconSlug: "docs",
  iconSrc: "/venturecite/images/resources/documentation.png",
};

// Resources mega-menu list. The source listed an API Reference and an MCP
// Server here; VentureCite ships neither, so those rows are gone rather than
// renamed. The Pricing row is gone too — the page's Pricing section was
// removed, and there is no other honest destination for it. Remaining rows
// point at routes that exist.
export const resourcesList: NavItem[] = [
  {
    name: "How it works",
    href: "#platform-section",
    description: "Track, understand, improve",
    iconSrc: "/venturecite/images/resources/api.png",
  },
  {
    name: "Why now",
    href: "#why-now-section",
    description: "What changed about discovery",
    iconSlug: "data",
  },
];

// Resources mega-menu footer row — appears together, delay 240ms (not staggered per-item).
export const resourcesFooterLinks = [
  { name: "Glossary", href: "/glossary" },
  { name: "Log in", href: "/login" },
  { name: "Get started", href: "/register" },
];

// Plain nav link (no mega-menu). Pricing is a real server-rendered route
// again (src/routes/pricing.tsx) — it's rendered directly in Nav.tsx as its
// own TanStack `<Link>` next to this one, not added here, since demoLink is
// an in-page "#" anchor and Pricing should navigate client-side to a
// different route.
export const demoLink = { name: "How it works", href: "#platform-section" };

// Mobile menu top link list ($e in TrakkrNav-JAUeEuWq.js). Index 0 ("Features")
// is always rendered with the accent/active treatment, per the source.
// Pricing is restored directly in MobileMenu.tsx as its own TanStack `<Link>`
// after this list, not as an entry here — see this array's rendering site.
export const mobileTopLinks = [
  { label: "Platform", href: "#platform-section" },
  { label: "Glossary", href: "/glossary" },
  { label: "Log in", href: "/login" },
  { label: "Get started", href: "/register" },
];

export const megaMenuEase = "cubic-bezier(0.16, 1, 0.3, 1)";
export const containerMaxWidth = 1120;
