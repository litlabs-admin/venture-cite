import type { db } from "../../../db";
import type { RequestRepositoryTransaction } from "../../../data/requestRepositoryTransaction";
import { setRestrictedRequestContext } from "../../../data/restrictedRequestTransaction";
import type { RequestActor } from "../../../lib/requestActor";
import {
  readBaselineBrand,
  readBaselineCitationRuns,
  readBaselineGeoRankings,
  readBaselinePromptGenerations,
  readBaselinePrompts,
} from "../../../storage/workOpportunityStorage";
import type { OpportunityReconciler } from "../OpportunityReconciler";
import {
  registerBaselineOpportunitySource,
  type BaselineOpportunityReader,
  type BaselineOpportunityRegistration,
} from "./baselineOpportunities";

export type ActorBoundBaselineReaderInput = {
  database: typeof db;
  actor: RequestActor;
};

/**
 * Create a reader that uses one request transaction for every baseline read.
 * The reader rejects a collection request from another actor before reading.
 */
export function createActorBoundBaselineReader({
  database,
  actor,
}: ActorBoundBaselineReaderInput): BaselineOpportunityReader {
  return {
    getBrandByIdForUser: (brandId, userId) => {
      if (userId !== actor.userId) return Promise.resolve(undefined);
      return readInRequestTransaction(database, actor, (transaction) =>
        readBaselineBrand(transaction, actor, brandId),
      );
    },
    getPromptGenerationsByBrandId: (brandId) =>
      readInRequestTransaction(database, actor, (transaction) =>
        readBaselinePromptGenerations(transaction, actor, brandId),
      ),
    getBrandPromptsByBrandId: (brandId) =>
      readInRequestTransaction(database, actor, (transaction) =>
        readBaselinePrompts(transaction, actor, brandId),
      ),
    getCitationRunsByBrandId: (brandId) =>
      readInRequestTransaction(database, actor, (transaction) =>
        readBaselineCitationRuns(transaction, actor, brandId),
      ),
    getGeoRankingsByRunId: (runId, brandId) =>
      readInRequestTransaction(database, actor, (transaction) =>
        readBaselineGeoRankings(transaction, actor, brandId, runId),
      ),
  };
}

/**
 * Register the actor-scoped baseline source in the production reconciler.
 * The caller supplies the same database and actor used by the work repository.
 */
export function registerProductionBaselineOpportunitySource({
  reconciler,
  database,
  actor,
}: {
  reconciler: Pick<OpportunityReconciler, "reconcile">;
  database: typeof db;
  actor: RequestActor;
}): BaselineOpportunityRegistration {
  const reader = createActorBoundBaselineReader({ database, actor });
  return registerBaselineOpportunitySource({ reconciler, reader });
}

async function readInRequestTransaction<T>(
  database: typeof db,
  actor: RequestActor,
  read: (transaction: RequestRepositoryTransaction) => Promise<T>,
): Promise<T> {
  return database.transaction(async (transaction) => {
    await setRestrictedRequestContext({ actor, role: "venturecite_request", transaction });
    return read(transaction);
  });
}
