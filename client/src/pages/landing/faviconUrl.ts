// The source page hotlinks brand favicons straight from Google's s2 service.
// This app's CSP pins img-src to 'self' + data: + blob: (server/app.ts), so
// those <img> tags are blocked by the browser and render as broken icons.
// Route them through the existing SSRF-guarded proxy instead — the same
// endpoint monitor-overview and welcome already use for competitor favicons.
export function faviconUrl(domain: string, size: number) {
  const upstream = `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
  return `/api/logo-proxy?url=${encodeURIComponent(upstream)}`;
}
