// Predicate deciding whether a brand has enough profile data for an
// AI-driven discovery feature to have something to anchor on, instead of
// producing generic noise (or, for the search-term builders, an empty query
// list that "succeeds" with zero candidates).
//
// The three call sites (keyword discovery, listicle discovery, Wikipedia
// scan preflight checks in server/routes/content.ts and
// server/routes/contentTypes.ts) each grew their own version of this check
// and they are NOT the same predicate - they differ in which fields count:
//   - keyword discovery also accepts targetAudience as sufficient on its own
//   - the Wikipedia scan additionally requires a non-empty brand name,
//     because wikipediaScanner builds its search terms from name+industry/
//     products and a nameless brand can't build a search term at all
// Consolidating these into one hardcoded rule would silently change which
// brands pass which preflight check. Instead this keeps one implementation
// of the underlying field checks and makes each difference an explicit,
// named, commented option.

export interface BrandProfileFields {
  name?: string | null;
  industry?: string | null;
  products?: unknown;
  targetAudience?: string | null;
}

export interface HasEnoughBrandProfileOptions {
  /** Also accept a non-empty targetAudience as sufficient on its own.
   *  Used by keyword discovery only. */
  includeAudience?: boolean;
  /** Additionally require a non-empty brand name. Used by the Wikipedia
   *  scan only, since its search terms are built from name+industry/products. */
  requireName?: boolean;
}

function nonEmptyString(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyProducts(products: unknown): boolean {
  return Array.isArray(products) && products.length > 0;
}

/**
 * Returns true when the brand has enough profile data (industry, products,
 * and - depending on the caller's options - target audience and/or a name)
 * for a discovery feature to proceed instead of returning a 400 asking the
 * user to fill in their brand profile first.
 */
export function hasEnoughBrandProfile(
  brand: BrandProfileFields,
  options: HasEnoughBrandProfileOptions = {},
): boolean {
  const base =
    nonEmptyString(brand.industry) ||
    nonEmptyProducts(brand.products) ||
    (options.includeAudience === true && nonEmptyString(brand.targetAudience));
  if (options.requireName) {
    return nonEmptyString(brand.name) && base;
  }
  return base;
}
