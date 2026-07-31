// One-time data repair for the "VenturePRspecializes…" whitespace bug.
//
// An older user-enrich prompt told the model to "clean whitespace", which it
// read as "delete every space", and the space-less value was persisted. The
// prompt is fixed for NEW runs, but re-runs deliberately skip user_manual /
// userOverridden rows, so an already-corrupted value in such a row is immune
// to re-scraping and must be repaired directly. This does that.
//
// It is SAFE: a row's value is only rewritten when its space-stripped form
// EXACTLY equals one of that brand's own source fields (description, name,
// products, etc.) and that field is the longer, properly-spaced form. Exact
// despaced equality means meaning can never change. Anything that looks
// space-collapsed but has no source match is reported, not touched.
//
// Usage (from the repo root, with your local env):
//   Dry run:  npx tsx --env-file=.env scripts/repair-fact-whitespace.ts
//   Apply:    npx tsx --env-file=.env scripts/repair-fact-whitespace.ts --apply
//   Scope:    add a brandId as the last arg to limit to one brand.

import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import * as schema from "@shared/schema";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const brandFilter = args.find((a) => a !== "--apply"); // optional brandId scope

const despace = (s: string): string => s.toLowerCase().replace(/\s+/g, "");
const tidy = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Restore spaces a model deleted from a verbatim-echoed source field. Returns
 *  the original value unchanged when there is no exact despaced source match. */
function restoreFromSources(value: string, sources: string[]): string {
  const key = despace(value);
  if (!key) return value;
  for (const src of sources) {
    const t = tidy(src);
    if (despace(t) === key && t.length > value.length) return t;
  }
  return value;
}

/** Every authoritative string this brand could have contributed to a fact. */
function sourceStringsFor(b: Record<string, unknown>): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  };
  const addArr = (v: unknown) => {
    if (Array.isArray(v)) for (const x of v) add(x);
  };
  add(b.name);
  add(b.description);
  add(b.industry);
  add(b.targetAudience);
  add(b.keyValues);
  add(b.brandVoice);
  add(b.tone);
  addArr(b.products);
  addArr(b.uniqueSellingPoints);
  return out;
}

// Heuristic for "looks space-collapsed" used only for the unmatched REPORT:
// a long value with no spaces at all, that isn't a URL / email / token.
function looksCollapsed(value: string): boolean {
  if (value.length < 30 || /\s/.test(value)) return false;
  if (/[:/@]|^https?/i.test(value)) return false; // urls, emails, paths
  return /[a-z]{20,}/i.test(value); // a long unbroken alpha run
}

async function main() {
  const brands = await db.select().from(schema.brands);
  const brandById = new Map(brands.map((b) => [b.id, b as Record<string, unknown>]));

  const facts = await db
    .select({
      id: schema.brandFactSheet.id,
      brandId: schema.brandFactSheet.brandId,
      factValue: schema.brandFactSheet.factValue,
      valueType: schema.brandFactSheet.valueType,
      source: schema.brandFactSheet.source,
      factKey: schema.brandFactSheet.factKey,
    })
    .from(schema.brandFactSheet);

  let repaired = 0;
  let unmatched = 0;
  let scanned = 0;

  for (const f of facts) {
    if (brandFilter && f.brandId !== brandFilter) continue;
    if (f.valueType !== "string") continue;
    scanned++;
    const brand = brandById.get(f.brandId);
    if (!brand) continue;

    const fixed = restoreFromSources(f.factValue, sourceStringsFor(brand));
    if (fixed !== f.factValue) {
      repaired++;
      console.log(
        `[repair] brand=${f.brandId} ${f.source}/${f.factKey}\n   from: ${JSON.stringify(f.factValue.slice(0, 70))}\n     to: ${JSON.stringify(fixed.slice(0, 70))}`,
      );
      if (APPLY) {
        await db
          .update(schema.brandFactSheet)
          .set({ factValue: fixed, updatedAt: new Date() })
          .where(eq(schema.brandFactSheet.id, f.id));
      }
      continue;
    }

    if (looksCollapsed(f.factValue)) {
      unmatched++;
      console.log(
        `[manual] brand=${f.brandId} ${f.source}/${f.factKey} looks space-collapsed but no source match - edit by hand:\n   ${JSON.stringify(f.factValue.slice(0, 90))}`,
      );
    }
  }

  // Diagnostic: flag brand RECORD fields that are themselves space-collapsed.
  // If brands.description is space-less, every "You" (source='user') fact
  // inherits it and the real fix is upstream - re-enter the brand info or fix
  // the brand-generation path - not this script.
  let brandFieldHits = 0;
  for (const b of brands as Array<Record<string, unknown>>) {
    if (brandFilter && b.id !== brandFilter) continue;
    for (const field of ["description", "name", "targetAudience", "keyValues"]) {
      const val = b[field];
      if (typeof val === "string" && looksCollapsed(val)) {
        brandFieldHits++;
        console.log(
          `[brand-field] brand=${b.id} brands.${field} is space-collapsed (upstream root cause):\n   ${JSON.stringify(val.slice(0, 90))}`,
        );
      }
    }
  }

  console.log(
    `\nScanned ${scanned} string facts. ${APPLY ? "Repaired" : "Would repair"} ${repaired}. ${unmatched} fact(s) need manual edits. ${brandFieldHits} brand field(s) look corrupted upstream.`,
  );
  if (brandFieldHits > 0) {
    console.log(
      "Upstream brand fields are space-collapsed - this script can't restore those (no clean source). " +
        "Fix the brand record (re-enter the description) so user-enrich stops inheriting the corruption.",
    );
  }
  if (!APPLY && repaired > 0) console.log("Re-run with --apply to write the changes.");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
