// Canonical brand-fact categories. These are the values the auto-scraper
// in server/lib/factExtractor.ts emits into brand_fact_sheet.factCategory,
// so the UI MUST group on the same set — otherwise every scraped row is
// invisible despite being in the DB.
//
// Keep this as the single source of truth: the scraper, the UI, and the
// "Add Fact" dialog all import from here.

export const FACT_CATEGORY_ORDER = [
  "founding",
  "funding",
  "team",
  "products",
  "pricing",
  "locations",
  "achievements",
  "other",
] as const;

export type FactCategory = (typeof FACT_CATEGORY_ORDER)[number];

export const FACT_CATEGORY_LABELS: Record<FactCategory, string> = {
  founding: "Founding",
  funding: "Funding",
  team: "Team",
  products: "Products",
  pricing: "Pricing",
  locations: "Locations",
  achievements: "Achievements",
  other: "Other",
};

export const FACT_CATEGORY_DESCRIPTIONS: Record<FactCategory, string> = {
  founding: "Year founded, HQ, founders, origin story",
  funding: "Investors, rounds, amounts raised",
  team: "Leadership, headcount, key hires",
  products: "Core features, product lineup, integrations",
  pricing: "Plans, tiers, free trial, pricing model",
  locations: "Offices, regions served",
  achievements: "Awards, customer count, revenue, milestones",
  other: "Anything else worth noting",
};

// Suggested fact keys shown in the Add-Fact dialog. Matches what the
// scraper tends to emit so manual + auto entries don't collide on different
// keys for the same thing.
export const SUGGESTED_FACTS: Record<FactCategory, { key: string; label: string }[]> = {
  founding: [
    { key: "year_founded", label: "Year Founded" },
    { key: "hq_city", label: "Headquarters" },
    { key: "founders", label: "Founders" },
    { key: "industry", label: "Industry" },
  ],
  funding: [
    { key: "total_raised", label: "Total Raised" },
    { key: "latest_round", label: "Latest Round" },
    { key: "latest_round_amount", label: "Latest Round Amount" },
    { key: "lead_investors", label: "Lead Investors" },
  ],
  team: [
    { key: "ceo_name", label: "CEO" },
    { key: "cto_name", label: "CTO" },
    { key: "employee_count", label: "Employee Count" },
  ],
  products: [
    { key: "core_features", label: "Core Features" },
    { key: "integrations", label: "Key Integrations" },
    { key: "platforms", label: "Supported Platforms" },
  ],
  pricing: [
    { key: "pricing_starter", label: "Starter Plan Price" },
    { key: "pricing_pro", label: "Pro Plan Price" },
    { key: "pricing_enterprise", label: "Enterprise Plan Price" },
    { key: "free_trial", label: "Free Trial Details" },
  ],
  locations: [
    { key: "primary_office", label: "Primary Office" },
    { key: "additional_offices", label: "Additional Offices" },
    { key: "regions_served", label: "Regions Served" },
  ],
  achievements: [
    { key: "customers_count", label: "Number of Customers" },
    { key: "revenue", label: "Annual Revenue" },
    { key: "awards", label: "Notable Awards" },
    { key: "press_highlights", label: "Press Highlights" },
  ],
  other: [
    { key: "tagline", label: "Tagline" },
    { key: "brand_values", label: "Brand Values" },
    { key: "target_audience", label: "Target Audience" },
  ],
};

export function isKnownFactCategory(value: string): value is FactCategory {
  return (FACT_CATEGORY_ORDER as readonly string[]).includes(value);
}
