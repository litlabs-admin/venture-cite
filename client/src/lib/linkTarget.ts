/**
 * Helpers for navigating to hrefs that are NOT compile-time route literals.
 *
 * Most navigation in this app can name its destination statically, and should:
 * `<Link to="/monitor" search={{ tab: "citations" }} />` is fully type-checked
 * against the generated route tree. These helpers exist for the minority of
 * cases where the destination arrives at runtime as an opaque string - the
 * `ctaHref`/`nextHref` fields on recommendations and run-change alerts, and the
 * onboarding step links - where no literal type is available to check against.
 *
 * They deliberately do NOT paper over the typed path. If you are reaching for
 * `toLinkTarget` with a string you control, use a literal `to` + `search`
 * instead and keep the type checking.
 */
export interface LinkTarget {
  to: string;
  search?: Record<string, string>;
}

/**
 * Split a runtime href (`/diagnose?tab=hallucinations`) into TanStack Router's
 * `to` + `search` shape.
 *
 * TanStack treats `to` as a path, not a URL - a `?query` embedded in it is not
 * parsed out, it becomes part of the path and the route fails to match. So any
 * href carrying its own query string must be decomposed before use.
 */
export function toLinkTarget(href: string): LinkTarget {
  const [path, qs = ""] = href.split("?");
  const search: Record<string, string> = {};
  new URLSearchParams(qs).forEach((value, key) => {
    search[key] = value;
  });
  return { to: path, search: Object.keys(search).length > 0 ? search : undefined };
}

/**
 * Carry the active brand on a deep link so the selection stays sticky when
 * navigating, without overriding a brand the target already names.
 *
 * Operates on an already-decomposed {@link LinkTarget} rather than on a URL
 * string: appending to a string only to split it apart again round-trips
 * through a format neither side wants, and each pass is a chance to mangle
 * encoding.
 */
export function withBrand(target: LinkTarget, brandId: string): LinkTarget {
  if (!brandId || target.search?.brandId) return target;
  return { to: target.to, search: { ...target.search, brandId } };
}
