// One-time cleanup: archive + regenerate citation prompts that name the brand.
//
// Before the brand-name enforcement landed, the generators only *asked* the LLM
// not to use the brand's name, so some stored brand_prompts.prompt values name
// the brand — which guarantees a fake self-citation on every run. This finds
// those rows (using the SAME matcher the citation run uses) and, for affected
// brands, regenerates a clean set via the now-fixed generators.
//
// Historical geo_rankings rows are left untouched — that's run history; the
// point is future runs use clean prompts.
//
// Usage (from repo root, with your local env):
//   Dry run:  npx tsx --env-file=.env scripts/scrubNamedPrompts.ts
//   Apply:    npx tsx --env-file=.env scripts/scrubNamedPrompts.ts --apply
//   Scope:    add a brandId as the last arg to limit to one brand.

import { pool } from "../server/db";
import { storage } from "../server/storage";
import { makeBrandNameFilter } from "../server/lib/brandNameFilter";
import { generateBrandPrompts } from "../server/lib/promptGenerator";
import { generateSuggestedPrompts } from "../server/lib/suggestionGenerator";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const brandFilter = args.find((a) => a !== "--apply"); // optional brandId scope

async function main() {
  const brands = await storage.getBrands();

  let brandsScanned = 0;
  let brandsTrackedRegen = 0;
  let brandsSuggestedRegen = 0;
  let trackedLeaksTotal = 0;
  let suggestedLeaksTotal = 0;

  for (const brand of brands) {
    if (brandFilter && brand.id !== brandFilter) continue;
    if ((brand as any).deletedAt) continue;
    brandsScanned++;

    const namesBrand = makeBrandNameFilter(brand);
    const [tracked, suggested] = await Promise.all([
      storage.getBrandPromptsByBrandId(brand.id, { status: "tracked" }),
      storage.getBrandPromptsByBrandId(brand.id, { status: "suggested" }),
    ]);

    const trackedLeaks = tracked.filter((p) => namesBrand(p.prompt));
    const suggestedLeaks = suggested.filter((p) => namesBrand(p.prompt));
    if (trackedLeaks.length === 0 && suggestedLeaks.length === 0) continue;

    trackedLeaksTotal += trackedLeaks.length;
    suggestedLeaksTotal += suggestedLeaks.length;
    console.log(
      `\n[brand] ${brand.name} (${brand.id}) — ${trackedLeaks.length} tracked / ${suggestedLeaks.length} suggested prompt(s) name the brand`,
    );
    for (const p of [...trackedLeaks, ...suggestedLeaks]) {
      console.log(`   • ${JSON.stringify(p.prompt.slice(0, 90))}`);
    }

    if (!APPLY) continue;

    if (trackedLeaks.length > 0) {
      const res = await generateBrandPrompts(brand);
      if (res.saved.length > 0) {
        brandsTrackedRegen++;
        console.log(`   → regenerated ${res.saved.length} clean tracked prompt(s)`);
      } else {
        console.log(`   ! tracked regeneration failed: ${res.error ?? "unknown"}`);
      }
    }
    if (suggestedLeaks.length > 0) {
      const res = await generateSuggestedPrompts(brand.id, { replaceExisting: true });
      if (res.saved.length > 0) {
        brandsSuggestedRegen++;
        console.log(`   → regenerated ${res.saved.length} clean suggested prompt(s)`);
      } else {
        console.log(`   ! suggested regeneration skipped/failed: ${res.error ?? "unknown"}`);
      }
    }
  }

  console.log(
    `\nScanned ${brandsScanned} brand(s). Found ${trackedLeaksTotal} tracked + ${suggestedLeaksTotal} suggested brand-naming prompt(s).`,
  );
  if (APPLY) {
    console.log(
      `Regenerated tracked for ${brandsTrackedRegen} brand(s), suggested for ${brandsSuggestedRegen} brand(s).`,
    );
  } else if (trackedLeaksTotal + suggestedLeaksTotal > 0) {
    console.log("Re-run with --apply to archive + regenerate the affected brands.");
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
