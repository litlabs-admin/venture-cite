// site.ts. Implements ReadSite (contracts.ts): fetches the homepage once,
// returns the Site wire shape plus the page text/html later producers reuse.
import { validateDomain } from "@shared/validateDomain";
import { faviconProxyUrl, siteSchema, type Site } from "@shared/onboarding/session";
import type { ReadSite } from "./contracts";
import { safeFetchText } from "../lib/ssrf";
import { extractPageContent, decodeEntities } from "../lib/pageText";

export const readSite: ReadSite = async (domain) => {
  const validation = validateDomain(domain);
  if (!validation.valid) {
    throw new Error(`Invalid domain: ${validation.reason}`);
  }
  const normalized = validation.normalized;
  const homepageUrl = `https://${normalized}`;

  const fetched = await safeFetchText(homepageUrl, {
    maxBytes: 2 * 1024 * 1024,
    timeoutMs: 10_000,
  });
  if (fetched.status < 200 || fetched.status >= 400) {
    throw new Error(`Could not reach ${normalized} (status ${fetched.status})`);
  }
  const html = fetched.text;
  const page = extractPageContent(html, 8_000);

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities(titleMatch?.[1]?.replace(/\s+/g, " ").trim() || "") || normalized;

  const site: Site = siteSchema.parse({
    domain: normalized,
    title,
    faviconUrl: faviconProxyUrl(normalized),
  });

  return { site, pageText: page.text, html };
};
