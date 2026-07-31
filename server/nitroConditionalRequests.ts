// Disables HTTP conditional requests for this deployment.
//
// This is a workaround for a real defect, not a caching policy.
//
// 304 Not Modified is a "null body status" in the Fetch spec, so
// `new Response(body, { status: 304 })` throws:
//
//   TypeError: Response constructor: Invalid response status code 304
//
// The Node-to-fetch adapters in this stack build a Response with a body
// regardless of status, so that throw happens inside them and reaches the
// client as a 500. In production the FIRST request to an endpoint succeeded
// and every repeat one failed, because only the repeat carried
// `If-None-Match`. The server logged "304" while the browser received a 500.
//
// It has to be fixed HERE, at the request hook, and that was established by
// elimination rather than guessed:
//
//   - Stripping the headers inside the Express bridge stops Express emitting
//     a 304, but the surrounding Nitro/h3 layer then computes its own ETag
//     and performs the comparison itself, recreating the 304 downstream.
//   - Stripping ETag from the bridge's response does not help either: that
//     layer re-adds its own, and discards a `Cache-Control` set there.
//
// The request hook runs before routing, so removing the headers here means
// nothing further down ever sees a conditional request, and no 304 can be
// produced by any layer.
//
// The cost is re-sending payloads a 304 could have skipped. These are
// dynamic, per-user authenticated responses that no shared cache was storing
// anyway (Vercel logs them as BYPASS), so the practical cost is small and
// the alternative is an endpoint that fails on every second call.
//
// Remove this once null-body statuses round-trip correctly through the
// adapter, and let conditional requests work normally again.
import type { NitroAppPlugin } from "nitro/types";

const CONDITIONAL_HEADERS = ["if-none-match", "if-modified-since"];

const plugin: NitroAppPlugin = (nitro) => {
  nitro.hooks.hook("request", (event) => {
    for (const header of CONDITIONAL_HEADERS) {
      try {
        event.req.headers.delete(header);
      } catch {
        // Some runtimes expose immutable request headers. Nothing to do -
        // the endpoint still works for non-conditional requests, which is
        // the same position as before this plugin existed.
      }
    }
  });
};

export default plugin;
