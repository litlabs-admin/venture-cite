/**
 * Re-derive work opportunities for every brand in a LOCAL database.
 *
 * The reconciler is normally reached through POST /work/reconcile, one brand at
 * a time. This runs the same service in process, which is what you want after
 * changing how an opportunity is derived: the running dev server holds the old
 * module in memory, so driving it through HTTP would re-create the old rows.
 *
 * Refuses to run against anything but a loopback database.
 */
import { assertLocalDatabase } from "./assert-local-db";

assertLocalDatabase(process.env.DATABASE_URL);
assertLocalDatabase(process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL);

const { storage } = await import("../server/storage");
const { createRequestActor } = await import("../server/lib/requestActor");
const { reconcileBrandWorkOpportunities } =
  await import("../server/services/work/productionOpportunities");

const brands = await storage.getBrands();
let failed = 0;

for (const brand of brands) {
  if (!brand.userId) {
    failed += 1;
    console.error(`${brand.name}: no owner, skipped`);
    continue;
  }
  try {
    const links = await reconcileBrandWorkOpportunities({
      actor: createRequestActor(brand.userId),
      brandId: brand.id,
    });
    console.log(`${brand.name}: ${links?.length ?? 0}`);
  } catch (error) {
    failed += 1;
    console.error(`${brand.name}: ${(error as Error).message.slice(0, 200)}`);
  }
}

console.log(`done. brands=${brands.length} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
