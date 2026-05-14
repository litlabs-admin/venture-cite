// Discover high-signal subdomain URLs from a homepage's <a href> tags.
// Used by the orchestrator to queue one secondary round of /scrape-one calls.
//
// "Registered domain" = the apex + the public suffix (e.g. example.com,
// example.co.uk). We don't pull in the `psl` package; instead we hardcode
// the small set of multi-segment public suffixes our user base actually
// uses. Adding more is one-line.
import { canonicalizeUrl } from "../canonicalize";

const HIGH_SIGNAL_SUBDOMAINS = new Set([
  "app",
  "docs",
  "documentation",
  "pricing",
  "customers",
  "help",
  "support",
  "kb",
  "api",
]);

// Minimal public-suffix list: multi-segment TLDs only. Single-segment ("com",
// "io") fall through to the default 2-level logic.
const MULTI_PUBLIC_SUFFIXES = ["co.uk", "co.jp", "com.au", "co.in", "co.za", "com.br", "com.mx"];

function registeredDomain(host: string): string {
  const h = host.toLowerCase();
  for (const sfx of MULTI_PUBLIC_SUFFIXES) {
    if (h.endsWith("." + sfx)) {
      const parts = h.slice(0, -sfx.length - 1).split(".");
      const apex = parts[parts.length - 1];
      return `${apex}.${sfx}`;
    }
  }
  const parts = h.split(".");
  if (parts.length < 2) return h;
  return parts.slice(-2).join(".");
}

export function discoverSubdomainUrls(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const baseRegistered = registeredDomain(base.hostname);

  const out = new Map<string, string>();
  const hrefRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    let abs: URL;
    try {
      abs = new URL(raw, base);
    } catch {
      continue;
    }
    if (abs.protocol !== "https:" && abs.protocol !== "http:") continue;
    if (registeredDomain(abs.hostname) !== baseRegistered) continue;

    // Extract first subdomain label (everything before the registered domain).
    const hostLc = abs.hostname.toLowerCase();
    const registered = registeredDomain(hostLc);
    if (hostLc === registered) continue; // apex itself — already the brand URL
    const sub = hostLc.slice(0, hostLc.length - registered.length - 1);
    const firstLabel = sub.split(".")[0];
    if (!HIGH_SIGNAL_SUBDOMAINS.has(firstLabel)) continue;

    const canonical = canonicalizeUrl(abs.toString());
    if (!out.has(canonical)) out.set(canonical, canonical);
  }
  return Array.from(out.values());
}
