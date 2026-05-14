// Logo scraping utility — extracted from the v1 factExtractor.ts.
// Provides only the favicon/icon discovery logic; no v1 fact-pipeline
// dependencies.

import { safeFetchText } from "./ssrf";
import { logger } from "./logger";

// Favicon-only logo resolution. Walks every <link rel=...icon...> tag in
// document order (covers rel="icon", rel="shortcut icon", rel="apple-touch-
// icon", rel="apple-touch-icon-precomposed"). Falls back to /favicon.ico with
// an existence probe. Returns a fully-qualified URL or null — no third-party
// fallback; null is a real signal.
export async function scrapeLogoUrl(homepageUrl: string, html: string): Promise<string | null> {
  const trace: Record<string, unknown> = { homepageUrl };

  const resolveHref = (href: string): string | null => {
    if (!href || href.startsWith("data:") || href.startsWith("#")) return null;
    try {
      return new URL(href, homepageUrl).toString();
    } catch {
      return null;
    }
  };

  // Confirms a scraped icon URL actually returns an image. Sites often list
  // <link rel=icon href=/old-name.png> that 404s, so we verify before handing
  // it to the client — otherwise the browser <img> fails silently and the
  // user sees no logo at all.
  const verifyIsImage = async (url: string): Promise<boolean> => {
    try {
      const { status, contentType } = await safeFetchText(url, {
        maxBytes: 256 * 1024,
        timeoutMs: 5_000,
      });
      if (status < 200 || status >= 300) return false;
      return contentType.startsWith("image/") || contentType.includes("icon") || contentType === "";
    } catch {
      return false;
    }
  };

  // 1) <link rel=...icon...> — collect all candidates, prefer apple-touch-icon
  //    (usually 180×180 PNG, the nicest logo we can get without fetching).
  const iconCandidates: { url: string; rel: string }[] = [];
  const linkRe = /<link\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    const relMatch = attrs.match(/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i);
    if (!relMatch) continue;
    const rel = (relMatch[1] || relMatch[2] || relMatch[3] || "").toLowerCase();
    if (!rel.includes("icon")) continue;
    const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|(\S+))/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1] || hrefMatch[2] || hrefMatch[3];
    const url = resolveHref(href);
    if (url) iconCandidates.push({ url, rel });
  }
  // Try candidates in priority order, verifying each actually loads.
  const ordered = [
    ...iconCandidates.filter((c) => c.rel.includes("apple-touch-icon")),
    ...iconCandidates.filter((c) => c.rel === "icon"),
    ...iconCandidates.filter((c) => !c.rel.includes("apple-touch-icon") && c.rel !== "icon"),
  ];
  const triedLinkTags: { url: string; rel: string; ok: boolean }[] = [];
  for (const candidate of ordered) {
    const ok = await verifyIsImage(candidate.url);
    triedLinkTags.push({ url: candidate.url, rel: candidate.rel, ok });
    if (ok) {
      trace.source = "link-tag";
      trace.rel = candidate.rel;
      trace.result = candidate.url;
      logger.info(trace, "scrapeLogoUrl trace");
      return candidate.url;
    }
  }
  if (triedLinkTags.length > 0) {
    trace.linkTagsTried = triedLinkTags;
  }

  // 2) <link rel="manifest"> — web app manifest lists icons in JSON.
  const manifestMatch = html.match(/<link\b[^>]*\brel\s*=\s*["']?manifest["']?[^>]*>/i);
  if (manifestMatch) {
    const hrefMatch = manifestMatch[0].match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|(\S+))/i);
    const manifestUrl = hrefMatch
      ? resolveHref(hrefMatch[1] || hrefMatch[2] || hrefMatch[3])
      : null;
    if (manifestUrl) {
      try {
        const { status, text } = await safeFetchText(manifestUrl, {
          maxBytes: 256 * 1024,
          timeoutMs: 5_000,
        });
        if (status >= 200 && status < 300 && text) {
          const parsed = JSON.parse(text) as { icons?: { src?: string }[] };
          const iconSrc = parsed.icons?.find((i) => typeof i.src === "string")?.src;
          if (iconSrc) {
            const url = resolveHref(iconSrc) ?? new URL(iconSrc, manifestUrl).toString();
            if (url && (await verifyIsImage(url))) {
              trace.source = "manifest";
              trace.result = url;
              logger.info(trace, "scrapeLogoUrl trace");
              return url;
            }
          }
        }
      } catch (err) {
        logger.warn({ err, manifestUrl }, "scrapeLogoUrl: manifest fetch/parse failed");
      }
    }
  }

  // 3) <meta property="og:image"> — site's own social-share image.
  const ogMatch = html.match(/<meta\b[^>]*\bproperty\s*=\s*["']og:image["'][^>]*>/i);
  if (ogMatch) {
    const contentMatch = ogMatch[0].match(/\bcontent\s*=\s*(?:"([^"]+)"|'([^']+)'|(\S+))/i);
    const ogUrl = contentMatch
      ? resolveHref(contentMatch[1] || contentMatch[2] || contentMatch[3])
      : null;
    if (ogUrl && (await verifyIsImage(ogUrl))) {
      trace.source = "og-image";
      trace.result = ogUrl;
      logger.info(trace, "scrapeLogoUrl trace");
      return ogUrl;
    }
  }

  // 4) /favicon.ico probe — only accept if the response is actually an image.
  try {
    const faviconUrl = new URL("/favicon.ico", homepageUrl).toString();
    const { status, contentType } = await safeFetchText(faviconUrl, {
      maxBytes: 256 * 1024,
      timeoutMs: 5_000,
    });
    const isImage =
      contentType.startsWith("image/") || contentType.includes("icon") || contentType === "";
    if (status >= 200 && status < 300 && isImage) {
      trace.source = "favicon.ico";
      trace.result = faviconUrl;
      logger.info(trace, "scrapeLogoUrl trace");
      return faviconUrl;
    }
    trace.faviconIcoStatus = status;
    trace.faviconIcoContentType = contentType;
  } catch (err) {
    logger.warn({ err }, "scrapeLogoUrl: favicon.ico probe failed");
    trace.faviconIcoError = err instanceof Error ? err.message : String(err);
  }

  trace.source = "none";
  trace.result = null;
  logger.info(trace, "scrapeLogoUrl trace");
  return null;
}
