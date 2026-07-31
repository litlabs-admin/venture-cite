// The landing page's navigation, in one place.
//
// This file used to carry five link sets feeding two mega-menus: features,
// solutions, tools, a resources list and a resources footer row — roughly
// thirty destinations, most of them pointing at /register or at an in-page
// anchor dressed up as a product page. The page has six sections; it did not
// need a navigation system.
//
// Nav, MobileMenu and Footer all render THIS list, so the page cannot
// disagree with itself about what it contains. Adding a section means adding
// one row here and one `id` on the section.
//
// Every href is an in-page anchor. The only real routes left in the chrome
// are Sign in and Get started, rendered directly by Nav/MobileMenu/Footer as
// TanStack <Link>s rather than living in this list — they are conversion
// actions, not navigation, and they navigate client-side.

export type SectionLink = {
  /** Label shown in the nav, mobile menu and footer. */
  name: string;
  /** `#id` of the target <section> on the landing page. */
  href: string;
};

// Order matches the order the sections appear on the page, and each label
// matches that section's own SectionHeader, so a nav row and the heading it
// scrolls to read the same. ("Approach" and "Proof" are those headers'
// subtitles — "Why VentureCite" and "Revenue" are too long for a nav row.)
export const pageSections: SectionLink[] = [
  { name: "Why now", href: "#why-now-section" },
  { name: "Platform", href: "#platform-section" },
  { name: "Approach", href: "#philosophy-section" },
  { name: "Proof", href: "#revenue-section" },
  { name: "Research", href: "#learn-research-section" },
];

export const containerMaxWidth = 1120;
