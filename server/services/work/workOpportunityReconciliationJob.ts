import { storage } from "../../storage";
import { logger } from "../../lib/logger";
import { createRequestActor } from "../../lib/requestActor";
import { reconcileBrandWorkOpportunities } from "./productionOpportunities";

export type WorkOpportunityReconciliationJobResult = {
  processed: number;
  failed: number;
  skipped: boolean;
};

export async function runWorkOpportunityReconciliationJob(): Promise<WorkOpportunityReconciliationJobResult> {
  if (process.env.DISABLE_WORK_OPPORTUNITY_RECONCILIATION === "true") {
    logger.info("work opportunity reconciliation job disabled");
    return { processed: 0, failed: 0, skipped: true };
  }

  const brands = await storage.getBrands();
  let failed = 0;

  for (const brand of brands) {
    if (!brand.userId) {
      failed += 1;
      logger.error({ brandId: brand.id }, "work opportunity reconciliation has no brand owner");
      continue;
    }

    try {
      await reconcileBrandWorkOpportunities({
        actor: createRequestActor(brand.userId),
        brandId: brand.id,
      });
    } catch (err) {
      failed += 1;
      logger.error({ err, brandId: brand.id }, "work opportunity reconciliation failed for brand");
    }
  }

  const processed = brands.length - failed;
  logger.info(
    { processed, failed, total: brands.length },
    "work opportunity reconciliation job complete",
  );
  return { processed, failed, skipped: false };
}
