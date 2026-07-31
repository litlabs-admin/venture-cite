// Structured-data pre-pass: extract brand facts from JSON-LD before
// any LLM call.
//
// Most large brands (and a meaningful fraction of small ones) ship
// schema.org Organization / Corporation / WebSite / LocalBusiness
// markup in their homepage HTML. That markup is:
//
//   - Deterministic - no LLM hallucination risk
//   - Free - no API cost
//   - Fast - pure string + JSON parsing
//   - Authoritative - the brand WROTE these facts about themselves
//
// We map every supported schema.org property to our controlled-vocab
// Fact shape and emit facts with confidence 1.0. The LLM stage then
// fills gaps; the consolidator merges structured-data facts and
// LLM-extracted facts via the same sources/alternatives machinery.
//
// What this DOES extract:
//   - Organization, Corporation, LocalBusiness, NewsMediaOrganization,
//     and other Organization subtypes
//   - WebSite (for name + url + sameAs)
//   - Person nested as founder/CEO/employee
//   - PostalAddress nested as address/contactPoint
//   - ContactPoint with email + telephone
//
// What this DOES NOT extract:
//   - Product / Offer schemas (covered by LLM stage; product lines are
//     more nuanced than the SDO Product schema captures)
//   - Article / NewsArticle / BlogPosting (these aren't brand facts)
//   - Event, JobPosting (out of scope)
//
// Edge cases handled:
//   - JSON-LD inside @graph wrapper (very common Yoast/WP pattern)
//   - Multiple @type per node (e.g. ["Organization", "LocalBusiness"])
//   - Arrays of single values (founder as array vs single value)
//   - Nested objects collapsed to strings where the schema permits

import type { Fact, Domain } from "@shared/factAgent/schema";

// Schema.org @type strings we treat as brand-identity sources.
const ORG_TYPES = new Set([
  "Organization",
  "Corporation",
  "LocalBusiness",
  "Restaurant",
  "Store",
  "OnlineStore",
  "OnlineBusiness",
  "NewsMediaOrganization",
  "EducationalOrganization",
  "GovernmentOrganization",
  "MedicalOrganization",
  "PerformingGroup",
  "NGO",
  "FinancialService",
  "Bank",
  "Brand",
]);

// @type strings we treat as the website-level descriptor (mostly just
// supplies website URL + name + sameAs).
const WEBSITE_TYPES = new Set(["WebSite"]);

type Node = Record<string, unknown>;

function getTypes(node: Node): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") {
    const o = v as Node;
    // schema.org sometimes wraps strings as {"@value": "..."}
    if (typeof o["@value"] === "string") return (o["@value"] as string).trim() || null;
    // Or as {"@id": "..."}
    if (typeof o["@id"] === "string") return (o["@id"] as string).trim() || null;
    // Or as {"name": "..."} when nested (e.g. Organization within Article)
    if (typeof o.name === "string") return (o.name as string).trim() || null;
  }
  return null;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// Walk a JSON-LD document. The root may be:
//   - A single node ({@type: ...})
//   - An array of nodes
//   - A node with @graph containing an array
//   - A node with @context only (skip)
// Returns ALL nodes flattened.
function* walkNodes(root: unknown): Generator<Node> {
  const stack: unknown[] = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
      continue;
    }
    const node = cur as Node;
    // Yield this node if it has an @type.
    if (node["@type"] !== undefined) yield node;
    // Push @graph children for further walking.
    if (node["@graph"]) stack.push(node["@graph"]);
    // Recurse into ALL property values so we find nested Organizations,
    // contactPoints, addresses, founder lists, etc.
    for (const key of Object.keys(node)) {
      if (key.startsWith("@")) continue;
      const v = node[key];
      if (v && typeof v === "object") stack.push(v);
    }
  }
}

function buildFact(
  domain: Domain,
  factKey: string,
  factValue: string,
  sourceUrl: string,
  excerpt: string,
): Fact {
  return {
    domain,
    factKey,
    factValue,
    valueType: "string",
    valuePayload: null,
    confidence: 1.0,
    sourceExcerpt: excerpt.slice(0, 200),
    sourceUrl,
  };
}

function buildArrayFact(
  domain: Domain,
  factKey: string,
  items: string[],
  sourceUrl: string,
  excerpt: string,
): Fact {
  return {
    domain,
    factKey,
    factValue: items.join(", "),
    valueType: "array",
    valuePayload: { items },
    confidence: 1.0,
    sourceExcerpt: excerpt.slice(0, 200),
    sourceUrl,
  };
}

function parseYear(v: string): string | null {
  // Accepts "2006", "2006-01-15", "2006-01-15T00:00:00Z", "ca. 2006".
  const m = /\b(19|20)\d{2}\b/.exec(v);
  return m ? m[0] : null;
}

function extractAddressFacts(addr: Node, sourceUrl: string): Fact[] {
  const out: Fact[] = [];
  const street = asString(addr.streetAddress);
  const city = asString(addr.addressLocality);
  const region = asString(addr.addressRegion);
  const postal = asString(addr.postalCode);
  const country = asString(addr.addressCountry);

  // Build a "headquarters" string from the parts that exist.
  const composedParts = [street, city, region, postal, country].filter(Boolean);
  if (composedParts.length > 0) {
    out.push(
      buildFact(
        "operations",
        "headquarters",
        composedParts.join(", "),
        sourceUrl,
        composedParts.join(", "),
      ),
    );
  }
  if (city) out.push(buildFact("contact", "city", city, sourceUrl, city));
  if (region) out.push(buildFact("contact", "stateRegion", region, sourceUrl, region));
  if (postal) out.push(buildFact("contact", "postalCode", postal, sourceUrl, postal));
  if (country) out.push(buildFact("contact", "country", country, sourceUrl, country));
  return out;
}

function extractContactPointFacts(cp: Node, sourceUrl: string): Fact[] {
  const out: Fact[] = [];
  const email = asString(cp.email);
  const phone = asString(cp.telephone);
  const role = asString(cp.contactType); // "customer service" | "sales" | ...
  if (email) {
    if (role && /sales|business/i.test(role)) {
      out.push(buildFact("contact", "salesEmail", email, sourceUrl, email));
    } else if (role && /support|customer/i.test(role)) {
      out.push(buildFact("contact", "supportEmail", email, sourceUrl, email));
    } else {
      out.push(buildFact("contact", "email", email, sourceUrl, email));
    }
  }
  if (phone) {
    if (role && /sales/i.test(role)) {
      out.push(buildFact("contact", "salesTelephone", phone, sourceUrl, phone));
    } else if (role && /support|customer/i.test(role)) {
      out.push(buildFact("contact", "supportTelephone", phone, sourceUrl, phone));
    } else {
      out.push(buildFact("contact", "telephone", phone, sourceUrl, phone));
    }
  }
  return out;
}

function extractOrgFacts(node: Node, sourceUrl: string): Fact[] {
  const out: Fact[] = [];

  const name = asString(node.name);
  if (name) out.push(buildFact("identity", "name", name, sourceUrl, name));

  const legalName = asString(node.legalName);
  if (legalName) out.push(buildFact("identity", "legalName", legalName, sourceUrl, legalName));

  const altNames = asArray(node.alternateName)
    .map(asString)
    .filter((s): s is string => !!s);
  if (altNames.length > 0) {
    // alternateName is single-string in our vocab; concatenate when multiple.
    out.push(buildFact("identity", "alternateName", altNames.join(" / "), sourceUrl, altNames[0]));
  }

  const description = asString(node.description);
  if (description) {
    out.push(buildFact("identity", "description", description, sourceUrl, description));
  }

  const url = asString(node.url);
  if (url) out.push(buildFact("identity", "website", url, sourceUrl, url));

  const logo = asString(node.logo);
  if (logo) out.push(buildFact("identity", "logoUrl", logo, sourceUrl, logo));

  const slogan = asString(node.slogan);
  if (slogan) out.push(buildFact("identity", "tagline", slogan, sourceUrl, slogan));

  // foundingDate (preferred) or founded (less common).
  const fd = asString(node.foundingDate) ?? asString(node.founded);
  if (fd) {
    const yr = parseYear(fd);
    if (yr) out.push(buildFact("identity", "foundedYear", yr, sourceUrl, fd));
  }

  // industry / naics / category - map to identity.industry.
  const industry = asString(node.industry) ?? asString(node.naics) ?? asString(node.category);
  if (industry) out.push(buildFact("identity", "industry", industry, sourceUrl, industry));

  // numberOfEmployees can be a QuantitativeValue node OR a string/number.
  const empNode = node.numberOfEmployees;
  if (empNode) {
    const empStr =
      asString(empNode) ??
      (typeof empNode === "object"
        ? (asString((empNode as Node).value) ?? asString((empNode as Node).minValue))
        : null);
    if (empStr) {
      out.push(buildFact("team", "employeeCount", empStr, sourceUrl, empStr));
    }
  }

  // Founders: array of Person nodes or strings.
  const founderArr = asArray(node.founder ?? node.founders);
  const founderNames = founderArr.map(asString).filter((s): s is string => !!s);
  if (founderNames.length > 0) {
    out.push(buildArrayFact("team", "founders", founderNames, sourceUrl, founderNames.join(", ")));
  }

  // CEO: top-level field or one of the executives.
  const ceo = asString(node.ceo);
  if (ceo) out.push(buildFact("team", "ceo", ceo, sourceUrl, ceo));

  // Address (PostalAddress node).
  const addr = node.address;
  if (addr && typeof addr === "object") {
    out.push(...extractAddressFacts(addr as Node, sourceUrl));
  }

  // Contact points (array of ContactPoint).
  const contactPoints = asArray(node.contactPoint);
  for (const cp of contactPoints) {
    if (cp && typeof cp === "object") {
      out.push(...extractContactPointFacts(cp as Node, sourceUrl));
    }
  }

  // sameAs → social links + alternate URLs.
  const sameAs = asArray(node.sameAs)
    .map(asString)
    .filter((s): s is string => !!s);
  if (sameAs.length > 0) {
    out.push(buildArrayFact("contact", "socialLinks", sameAs, sourceUrl, sameAs.join(", ")));
  }

  // Awards.
  const awards = asArray(node.award)
    .map(asString)
    .filter((s): s is string => !!s);
  if (awards.length > 0) {
    out.push(buildArrayFact("credentials", "awards", awards, sourceUrl, awards.join(", ")));
  }

  // tickerSymbol - Corporation-specific.
  const ticker = asString(node.tickerSymbol);
  if (ticker) {
    out.push(buildFact("identity", "publicTradingSymbol", ticker, sourceUrl, ticker));
  }

  // areaServed → operatingRegions.
  const areaServed = asArray(node.areaServed)
    .map(asString)
    .filter((s): s is string => !!s);
  if (areaServed.length > 0) {
    out.push(
      buildArrayFact(
        "operations",
        "operatingRegions",
        areaServed,
        sourceUrl,
        areaServed.join(", "),
      ),
    );
  }

  return out;
}

function extractWebsiteFacts(node: Node, sourceUrl: string): Fact[] {
  const out: Fact[] = [];
  // WebSite usually has name + url + (optionally) publisher (Organization)
  const url = asString(node.url);
  if (url) out.push(buildFact("identity", "website", url, sourceUrl, url));
  const name = asString(node.name);
  if (name) out.push(buildFact("identity", "name", name, sourceUrl, name));
  return out;
}

/** Parse every <script type="application/ld+json"> block in the HTML
 *  and return the facts extractable from schema.org Organization /
 *  WebSite / Corporation / LocalBusiness markup.
 *
 *  No LLM call. Cost = 0. Latency = string parse + JSON parse. */
export function extractStructuredFacts(html: string, sourceUrl: string): Fact[] {
  const facts: Fact[] = [];
  const blockRegex =
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Malformed block - skip silently.
      continue;
    }
    const iter = walkNodes(parsed);
    let next = iter.next();
    while (!next.done) {
      const node = next.value;
      const types = getTypes(node);
      const hasOrgType = types.some((t) => ORG_TYPES.has(t));
      const hasWebsiteType = types.some((t) => WEBSITE_TYPES.has(t));
      if (hasOrgType) facts.push(...extractOrgFacts(node, sourceUrl));
      else if (hasWebsiteType) facts.push(...extractWebsiteFacts(node, sourceUrl));
      next = iter.next();
    }
  }
  // Dedup within the response (same fact may appear in @graph + nested):
  // collapse by (domain, factKey, factValue) - the LLM-stage consolidator
  // will merge across sources anyway.
  const seen = new Set<string>();
  const out: Fact[] = [];
  for (const f of facts) {
    const key = `${f.domain}|${f.factKey}|${f.factValue.toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
