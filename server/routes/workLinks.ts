import { createRequestActor } from "../lib/requestActor";
import { logger } from "../lib/logger";
import type { WorkTaskLink } from "../services/work/productionOpportunities";

export async function readWorkTaskLinks(
  userId: string,
  brandId: string,
  source: string,
): Promise<readonly WorkTaskLink[] | undefined> {
  try {
    const { reconcileBrandWorkOpportunities } =
      await import("../services/work/productionOpportunities");
    return await reconcileBrandWorkOpportunities({
      actor: createRequestActor(userId),
      brandId,
    });
  } catch (error) {
    logger.warn({ err: error, brandId, source }, "work opportunity reconciliation failed");
    return undefined;
  }
}

export function withWorkTaskLinks<T extends Record<string, unknown>>(
  body: T,
  links: readonly WorkTaskLink[] | undefined,
): T & { workTaskLinks?: readonly WorkTaskLink[] } {
  if (links === undefined) return body;
  return { ...body, workTaskLinks: links };
}
