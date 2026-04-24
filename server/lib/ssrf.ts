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
