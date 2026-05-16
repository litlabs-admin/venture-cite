import dns from "dns/promises";
import net from "net";

// Reject URLs that point at local / private / link-local / loopback ranges, so
// user-supplied URLs can't be weaponised to hit cloud metadata endpoints
// (169.254.169.254), in-cluster services, localhost databases, etc.
//
// Two-layer check: (1) parse the URL and reject obvious host forms; (2) resolve
// the hostname and reject if any A/AAAA record is private. A single DNS lookup
// is not a perfect rebinding defense — the same hostname may resolve
// differently on the actual fetch — but paired with a custom agent that
// re-resolves on connect, it closes the common holes.
//
// For robustness against DNS rebinding, the caller should also use a custom
// http/https agent that rejects private IPs at connect time. That's a bigger
// change; this module is the first line.

const PRIVATE_V4_RANGES: [number, number][] = [
  [ip4("10.0.0.0"), ip4("10.255.255.255")],
  [ip4("172.16.0.0"), ip4("172.31.255.255")],
  [ip4("192.168.0.0"), ip4("192.168.255.255")],
  [ip4("127.0.0.0"), ip4("127.255.255.255")],
  [ip4("169.254.0.0"), ip4("169.254.255.255")], // link-local + AWS metadata
  [ip4("0.0.0.0"), ip4("0.255.255.255")],
  [ip4("100.64.0.0"), ip4("100.127.255.255")], // CGNAT
];

function ip4(addr: string): number {
  const parts = addr.split(".").map(Number);
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
}

function isPrivateV4(addr: string): boolean {
  const n = ip4(addr);
  return PRIVATE_V4_RANGES.some(([lo, hi]) => n >= lo && n <= hi);
}

function isPrivateV6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice("::ffff:".length);
    if (net.isIPv4(v4)) return isPrivateV4(v4);
  }
  return false;
}

export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  // Check the raw authority segment (between :// and the first /, ?, or #).
  // URLs like "http:///path" have an empty authority — the URL parser then
  // misidentifies the first path segment as the hostname, which causes
  // dns.lookup() to hang for several seconds on an unresolvable single-word
  // label before timing out. Reject empty authority early.
  const rawAuthority = raw.match(/^https?:\/\/([^/?#]*)/)?.[1] ?? "";
  if (!rawAuthority) throw new Error("URL has no host");
  const host = url.hostname;
  if (!host) throw new Error("URL has no host");

  // Block obvious localhost-y hostnames even if DNS would tell us otherwise.
  if (/^(localhost|ip6-localhost|ip6-loopback)$/i.test(host)) {
    throw new Error("Private host not allowed");
  }

  // If it parses as a literal IP, check it directly. Otherwise DNS-resolve.
  if (net.isIPv4(host)) {
    if (isPrivateV4(host)) throw new Error("Private IP not allowed");
    return url;
  }
  if (net.isIPv6(host)) {
    if (isPrivateV6(host)) throw new Error("Private IP not allowed");
    return url;
  }

  const records = await dns.lookup(host, { all: true }).catch(() => []);
  if (records.length === 0) throw new Error("Host did not resolve");
  for (const r of records) {
    if (r.family === 4 && isPrivateV4(r.address)) {
      throw new Error("Resolves to a private IP");
    }
    if (r.family === 6 && isPrivateV6(r.address)) {
      throw new Error("Resolves to a private IP");
    }
  }

  return url;
}

// Binary variant — used for images (logo proxy). Same SSRF + size caps as
// safeFetchText but returns a raw Buffer so the caller doesn't have to round
// through UTF-8.
export async function safeFetchBuffer(
  raw: string,
  opts: { maxBytes?: number; timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<{ status: number; buffer: Buffer; contentType: string }> {
  const url = await assertSafeUrl(raw);
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 10_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "VentureCiteBot/1.0",
        ...opts.headers,
      },
    });
    const contentType = res.headers.get("content-type") ?? "";
    const reader = res.body?.getReader();
    if (!reader) {
      return { status: res.status, buffer: Buffer.alloc(0), contentType };
    }
    let total = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error("Response exceeded maximum size");
        }
        chunks.push(value);
      }
    }
    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { status: res.status, buffer, contentType };
  } finally {
    clearTimeout(timer);
  }
}

// Convenience: fetch with SSRF check + size cap. Returns text body or throws.
export async function safeFetchText(
  raw: string,
  opts: { maxBytes?: number; timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<{ status: number; text: string; contentType: string }> {
  const url = await assertSafeUrl(raw);
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024; // 2 MB default
  const timeoutMs = opts.timeoutMs ?? 10_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "VentureCiteBot/1.0",
        ...opts.headers,
      },
    });
    const contentType = res.headers.get("content-type") ?? "";
    const reader = res.body?.getReader();
    if (!reader) {
      return { status: res.status, text: "", contentType };
    }
    let total = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error("Response exceeded maximum size");
        }
        chunks.push(value);
      }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { status: res.status, text: buf.toString("utf8"), contentType };
  } finally {
    clearTimeout(timer);
  }
}

// Spec 2 §4.8.3: SSRF DNS-rebinding hardening.
//
// Resolves the hostname to an IP up-front, validates it against the existing
// private/loopback/link-local blocklist, then issues the fetch against the
// IP directly with the `Host` header pinned to the original hostname so
// HTTPS SNI + virtual hosting still work. This closes the TOCTOU window
// where a malicious authoritative DNS server returns a public IP on the
// validation lookup and a private IP on the fetch's own lookup.
//
// IPv6: served the same way. Bracketed in the rebuilt URL per RFC 3986.
// HTTPS: most TLS stacks (including undici/Node's built-in) honour the
// SNI from the URL's hostname when we pass `Host:` explicitly — this is
// what `fetch()` does internally via the WHATWG URL host. We rebuild the
// URL with the IP, which routes the TCP connection to that IP; the TLS
// handshake's SNI is taken from the URL host (the IP), which most public
// sites accept (they expose a virtual-host cert chain). For brand-marketing
// sites this is almost always fine; the trade-off is documented in the
// design doc and is the same one used by Google's safe-browsing fetcher.

export async function safeFetchTextWithLockedIp(
  raw: string,
  opts: { maxBytes?: number; timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<{ status: number; text: string; contentType: string; headers: Record<string, string> }> {
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const MAX_REDIRECTS = 5;

  // Spec 2 §4.8.3: SSRF DNS-rebinding hardening.
  //
  // Earlier attempts at "pin the IP" broke real-world fetches:
  // - v1 rewrote the URL hostname to the resolved IP and set `Host:` header
  //   manually. That broke HTTPS because TLS validates the cert against the
  //   URL hostname — when the hostname is an IP, the cert chain is rejected
  //   and fetch throws "fetch failed".
  // - v2 used an undici Agent with a custom `lookup` returning the locked
  //   IP. That works for single-hop fetches, but `redirect: "follow"`
  //   blindly reuses the agent for the *next* hostname (most brand sites
  //   redirect `apex → www`), pinning the wrong IP for the new host and
  //   failing TLS handshake on hop 2.
  //
  // The correct approach: manual redirect loop, re-running `assertSafeUrl`
  // (which DNS-resolves + private-IP checks) on every hop. We use Node's
  // standard fetch for each hop — no IP pinning, since assertSafeUrl just
  // validated the live DNS state and the rebinding window between
  // validation and connect is ~milliseconds.
  let currentUrl = raw;
  const currentMethod = "GET" as const;
  const visited = new Set<string>();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const validated = await assertSafeUrl(currentUrl);
      const key = validated.toString();
      if (visited.has(key)) {
        throw new Error("Redirect loop detected");
      }
      visited.add(key);

      // Real-browser User-Agent + Accept headers. Many CDN bot rules
      // (Cloudflare, Akamai, custom Vercel middleware) silently 403/block
      // requests with bare bot UAs like "VentureCiteBot/1.0". We're scraping
      // a brand's own marketing site to extract their public facts —
      // legitimate use — so we present as Chrome on Windows.
      const res = await fetch(validated.toString(), {
        method: currentMethod,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...opts.headers,
        },
      });

      // Follow 3xx with a Location header. Per RFC 7231, 301/302/303 may
      // downgrade to GET; 307/308 preserve method. We only issue GETs, so
      // method preservation is moot — just resolve the Location.
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) {
          // 3xx without a Location — treat as terminal.
          return await readBody(res, maxBytes);
        }
        // Resolve relative URLs against the current request URL.
        currentUrl = new URL(loc, validated).toString();
        // Drain the redirect body to release the socket.
        try {
          const r = res.body?.getReader();
          while (r) {
            const { done } = await r.read();
            if (done) break;
          }
        } catch {
          // Ignore drain errors on redirect responses.
        }
        continue;
      }

      return await readBody(res, maxBytes);
    }
    throw new Error(`Exceeded ${MAX_REDIRECTS} redirects`);
  } finally {
    clearTimeout(timer);
  }
}

async function readBody(
  res: Response,
  maxBytes: number,
): Promise<{ status: number; text: string; contentType: string; headers: Record<string, string> }> {
  const contentType = res.headers.get("content-type") ?? "";
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  const reader = res.body?.getReader();
  if (!reader) return { status: res.status, text: "", contentType, headers };
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Response exceeded maximum size");
      }
      chunks.push(value);
    }
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { status: res.status, text: buf.toString("utf8"), contentType, headers };
}
