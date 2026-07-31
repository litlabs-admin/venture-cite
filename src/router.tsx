import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Search params are serialized as plain strings, matching this product's
 * long-standing URL contract.
 *
 * TanStack's default serializer JSON-encodes values, which round-trips
 * correctly inside the app but changes the URLs the product emits:
 *
 *     default:  { brandId: "42" }  ->  ?brandId=%2242%22   (i.e. ?brandId="42")
 *     here:     { brandId: "42" }  ->  ?brandId=42
 *
 * That difference matters because URLs here are not only produced by the
 * router. They are typed by hand, bookmarked, mailed out in recommendation
 * CTAs, and asserted on by the E2E suite. Under the default serializer an
 * externally-authored `?brandId=42` parses to the NUMBER 42 while an
 * app-authored one parses to the STRING "42" - the same URL yielding two
 * different types depending on who wrote it, which is precisely the class of
 * bug that only shows up in production via a shared link.
 *
 * Every consumer in this codebase reads search params as strings (they were
 * previously read through `new URLSearchParams(...)`), so string-in/string-out
 * is both the existing contract and the honest type. Structured values are
 * deliberately unsupported: if a param ever needs richer typing, give that
 * route a `validateSearch` schema that parses the string, rather than
 * reintroducing ambiguity at the serializer.
 */
function parseSearch(searchStr: string): Record<string, string> {
  const params = new URLSearchParams(searchStr.startsWith("?") ? searchStr.slice(1) : searchStr);
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    out[key] = value;
  }
  return out;
}

function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    // Drop empty params rather than emitting `?tab=`, matching how the
    // previous URLSearchParams-based call sites behaved when clearing state.
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// TanStack Start's required router factory. Referenced by the framework's own
// client/server entry points.
export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    parseSearch,
    stringifySearch,
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
