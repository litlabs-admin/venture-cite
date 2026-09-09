import { db } from "../../db";
import type { RequestActor } from "../../lib/requestActor";
import type { RequestRepositoryTransaction } from "../../data/requestRepositoryTransaction";
import { setRestrictedRequestContext } from "../../data/restrictedRequestTransaction";
import type { BrandId } from "../../domains/work/types";
import { createWorkRepository } from "../../domains/work/repository";
import { createOpportunityReconciler } from "./OpportunityReconciler";
import { createFactOpportunitySource } from "./sources/factOpportunities";
import { createQuestionOpportunitySource } from "./sources/questionOpportunities";
import { createPageImprovementOpportunitySource } from "./sources/pageImprovementOpportunities";
import { createEarnedMediaOpportunitySource } from "./sources/earnedMediaOpportunities";
import { createExperimentOpportunitySource } from "./sources/experimentOpportunities";
import { createOutcomeReviewOpportunitySource } from "./sources/outcomeReviewOpportunities";
import { registerProductionBaselineOpportunitySource } from "./sources/productionBaselineOpportunities";
import {
  readFactOpportunityRecords,
  readPageImprovementOpportunityRecords,
  readCommunityPostOpportunityRecords,
  readListicleOpportunityRecords,
  readQuestionOpportunityRecords,
  readExperimentOpportunityRecords,
  readOutcomeReviewOpportunityRecords,
} from "../../storage/workOpportunityStorage";
import type { WorkTaskView } from "../../storage/workStorage";

export type WorkTaskLink = Pick<
  WorkTaskView,
  "id" | "taskKey" | "taskVersion" | "taskType" | "state"
> & {
  /** Relative API URL for loading the task details in the current session. */
  url?: string;
};

export type ReconcileBrandWorkInput = {
  actor: RequestActor;
  brandId: string;
};

/**
 * Reconcile authoritative fact and prompt records into customer task links.
 * The work repository and both readers use the same actor and brand scope.
 */
export async function reconcileBrandWorkOpportunities(
  input: ReconcileBrandWorkInput,
  database: typeof db = db,
): Promise<readonly WorkTaskLink[] | undefined> {
  if (typeof database.transaction !== "function") return undefined;

  const actor = input.actor;
  const brandId = toBrandId(input.brandId);
  const repository = createWorkRepository({ actor, database });
  const reconciler = createOpportunityReconciler({ repository });
  const baselineRegistration = registerProductionBaselineOpportunitySource({
    reconciler,
    database,
    actor,
  });
  const sources = [
    createFactOpportunitySource({
      readFacts: ({ actor: sourceActor, brandId: sourceBrandId }) =>
        readInRequestTransaction(database, sourceActor, (transaction) =>
          readFactOpportunityRecords(transaction, sourceActor, sourceBrandId),
        ),
    }),
    createQuestionOpportunitySource({
      readQuestions: ({ actor: sourceActor, brandId: sourceBrandId }) =>
        readInRequestTransaction(database, sourceActor, (transaction) =>
          readQuestionOpportunityRecords(transaction, sourceActor, sourceBrandId),
        ),
    }),
    createPageImprovementOpportunitySource({
      readPages: ({ actor: sourceActor, brandId: sourceBrandId }) =>
        readInRequestTransaction(database, sourceActor, (transaction) =>
          readPageImprovementOpportunityRecords(transaction, sourceActor, sourceBrandId),
        ),
    }),
    createExperimentOpportunitySource({
      readContent: ({ actor: sourceActor, brandId: sourceBrandId }) =>
        readInRequestTransaction(database, sourceActor, (transaction) =>
          readExperimentOpportunityRecords(transaction, sourceActor, sourceBrandId),
        ),
    }),
    createEarnedMediaOpportunitySource({
      readCommunityPosts: ({ actor: sourceActor, brandId: sourceBrandId }) =>
        readInRequestTransaction(database, sourceActor, (transaction) =>
          readCommunityPostOpportunityRecords(transaction, sourceActor, sourceBrandId),
        ),
      readListicles: ({ actor: sourceActor, brandId: sourceBrandId }) =>
        readInRequestTransaction(database, sourceActor, (transaction) =>
          readListicleOpportunityRecords(transaction, sourceActor, sourceBrandId),
        ),
    }),
    createOutcomeReviewOpportunitySource({
      readTasks: ({ actor: sourceActor, brandId: sourceBrandId }) =>
        readInRequestTransaction(database, sourceActor, (transaction) =>
          readOutcomeReviewOpportunityRecords(transaction, sourceActor, sourceBrandId),
        ),
    }),
    baselineRegistration.source,
  ];
  const tasks = await reconciler.reconcile({ actor, brandId, sources });
  return tasks.map(toTaskLink);
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

function toTaskLink(task: WorkTaskView): WorkTaskLink {
  return {
    id: task.id,
    taskKey: task.taskKey,
    taskVersion: task.taskVersion,
    taskType: task.taskType,
    state: task.state,
    url: `/api/brands/${encodeURIComponent(task.brandId)}/work/tasks/${encodeURIComponent(task.id)}`,
  };
}

function toBrandId(value: string): BrandId {
  if (value.trim().length === 0) throw new Error("Work opportunity brandId is required");
  return value as BrandId;
}
