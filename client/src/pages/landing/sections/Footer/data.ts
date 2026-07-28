// Link data extracted verbatim from index.html:3627-3769. The mobile
// condensed grid (sm:hidden, lines 3638-3666) and the desktop grid (hidden
// sm:grid, lines 3675-3739) render genuinely different link sets per
// column — not a responsive subset of the same array — so each is kept as
// its own list rather than forcing a shared one.

export interface FooterLink {
  name: string;
  href: string;
}

// Rebranded for VentureCite: the source's per-page marketing routes
// (/trakkr-for/*, /features, /pricing, /integrations, /blog, /learn/*,
// /about, /demo, /security, /terms, /status, etc.) don't exist in this app.
// Every link below now resolves to a real public route or an in-page anchor
// on this page — see the anchor list in home2's section files (id="...-section").
export const solutionsLinks: FooterLink[] = [
  { name: "For Startups", href: "/register" },
  { name: "For Agencies", href: "/register" },
  { name: "For Enterprise", href: "/register" },
];

// Mobile Product column (Free Tools trigger removed — no honest destination).
// Pricing is a real server-rendered route again (src/routes/pricing.tsx) —
// it's added in Footer.tsx via FooterColumn's `children` slot as a TanStack
// `<Link>`, not as an entry here, since every href below is a full-reload
// `<a>` and Pricing should navigate client-side.
export const mobileProductLinks: FooterLink[] = [
  { name: "Platform", href: "#platform-section" },
  { name: "Content", href: "#philosophy-section" },
];

// Desktop Product column (Free Tools trigger removed — no honest destination).
// Pricing restored the same way as the mobile column above — see that comment.
export const desktopProductLinks: FooterLink[] = [
  { name: "Platform", href: "#platform-section" },
  { name: "Content", href: "#philosophy-section" },
  { name: "GEO Signals", href: "#philosophy-section" },
  { name: "Competitors", href: "#revenue-section" },
  { name: "Crawler Check", href: "#platform-section" },
];

// Mobile Learn column.
export const mobileLearnLinks: FooterLink[] = [
  { name: "Glossary", href: "/glossary" },
  { name: "Research", href: "#learn-research-section" },
];

// Desktop Learn column.
export const desktopLearnLinks: FooterLink[] = [
  { name: "Glossary", href: "/glossary" },
  { name: "Research", href: "#learn-research-section" },
];
