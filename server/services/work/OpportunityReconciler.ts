import { WorkPolicyError, type TaskCommand } from "@shared/work";
import type { RequestActor } from "../../lib/requestActor";
import type {
  WorkMutationResult,
  WorkOpportunityRepository,
  WorkRepository,
  WorkTaskTriggerCreateInput,
} from "../../domains/work/repository";
import type { BrandId } from "../../domains/work/types";
import {
  validateWorkOpportunity,
  type TriggerEvidenceReference,
  type WorkOpportunity,
  type WorkOpportunitySource,
} from "../../domains/work/opportunities";
import type { WorkTaskView } from "../../storage/workStorage";

export type OpportunityReconciliationInput = {
  actor: RequestActor;
  brandId: string;
  sources: readonly WorkOpportunitySource[];
};

export type OpportunityReconciliationErrorCode = "not_found" | "conflict";

export class OpportunityReconciliationError extends Error {
  readonly code: OpportunityReconciliationErrorCode;
  readonly currentRevision?: number;

  constructor(code: OpportunityReconciliationErrorCode, message: string, currentRevision?: number) {
    super(message);
    this.name = "OpportunityReconciliationError";
    this.code = code;
    this.currentRevision = currentRevision;
  }
}

export type OpportunityReconciler = {
  reconcile(input: OpportunityReconciliationInput): Promise<WorkTaskView[]>;
};

type ScopedOpportunity = {
  sourceKey: string;
  opportunity: WorkOpportunity;
};

type OpportunityReconcilerRepository = Pick<
  WorkRepository,
  "getTask" | "listTasks" | "transitionTask"
> &
  WorkOpportunityRepository;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function asTaskVersion(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function storedRuleVersion(task: WorkTaskView): number {
  const completionRule = task.completionRule;
  if (
    isRecord(completionRule) &&
    typeof completionRule.ruleVersion === "number" &&
    Number.isInteger(completionRule.ruleVersion) &&
    completionRule.ruleVersion > 0
  ) {
    return completionRule.ruleVersion;
  }
  return asTaskVersion(task.taskVersion);
}

function taskInput(scoped: ScopedOpportunity, taskVersion: number): WorkTaskTriggerCreateInput {
  const { opportunity } = scoped;
  return {
    taskKey: opportunity.taskKey,
    taskVersion,
    taskType: opportunity.taskType,
    title: opportunity.title,
    desiredResult: opportunity.title,
    recommendedChange: opportunity.reason,
    reason: opportunity.reason,
    completionRule: {
      ...clone(opportunity.completionRule),
      ruleVersion: opportunity.ruleVersion,
    },
    ruleVersion: opportunity.ruleVersion,
  };
}

function notFound(message: string): OpportunityReconciliationError {
  return new OpportunityReconciliationError("not_found", message);
}

function normalizedSourceKey(value: string): string {
  const sourceKey = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sourceKey)) {
    throw new WorkPolicyError(
      "configuration_error",
      "Work opportunity sourceKey must be a stable namespace",
    );
  }
  return sourceKey;
}

function taskKey(task: WorkTaskView): string {
  return task.taskKey.trim();
}

function belongsToSource(task: WorkTaskView, sourceKey: string): boolean {
  return taskKey(task).startsWith(`${sourceKey}:`);
}

function nextTaskVersion(tasks: readonly WorkTaskView[]): number {
  return tasks.reduce((highest, item) => Math.max(highest, asTaskVersion(item.taskVersion)), 0) + 1;
}

function dismissCommand(reason: string): TaskCommand {
  return { kind: "dismiss", reason };
}

async function dismissObsoleteSuggestedTask(
  repository: Pick<WorkRepository, "getTask" | "transitionTask">,
  brandId: string,
  item: WorkTaskView,
  reason: string,
): Promise<WorkTaskView | undefined> {
  let candidate = item;
  let lastConflictRevision: number | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await repository.transitionTask(
      brandId,
      candidate.id,
      candidate.revision,
      dismissCommand(reason),
    );
    if (result.kind === "updated") return result.value;
    if (result.kind !== "conflict") return undefined;
    lastConflictRevision = result.currentRevision;
    const latest = await repository.getTask(brandId, item.id);
    if (!latest || latest.state !== "suggested") return undefined;
    candidate = latest;
  }
  throw new OpportunityReconciliationError(
    "conflict",
    "The repository could not dismiss the obsolete opportunity because the task changed",
    lastConflictRevision,
  );
}

function mergeEvidence(
  left: readonly TriggerEvidenceReference[],
  right: readonly TriggerEvidenceReference[],
): TriggerEvidenceReference[] {
  const unique = new Map<string, TriggerEvidenceReference>();
  for (const reference of [...left, ...right]) {
    const key = canonical(reference);
    if (!unique.has(key)) unique.set(key, clone(reference));
  }
  return [...unique.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([, reference]) => reference);
}

function groupOpportunities(
  collected: readonly { sourceKey: string; value: unknown }[],
  actor: RequestActor,
): ScopedOpportunity[] {
  const grouped = new Map<string, ScopedOpportunity>();
  for (const item of collected) {
    const opportunity = validateWorkOpportunity(item.value, actor, item.sourceKey);
    const groupKey = `${item.sourceKey}\u0000${opportunity.taskKey}\u0000${opportunity.ruleVersion}`;
    const prior = grouped.get(groupKey);
    if (!prior) {
      grouped.set(groupKey, {
        sourceKey: item.sourceKey,
        opportunity: {
          ...opportunity,
          completionRule: clone(opportunity.completionRule),
          evidence: mergeEvidence([], opportunity.evidence),
        },
      });
      continue;
    }
    if (
      prior.opportunity.taskType !== opportunity.taskType ||
      prior.opportunity.title !== opportunity.title ||
      prior.opportunity.reason !== opportunity.reason ||
      canonical(prior.opportunity.completionRule) !== canonical(opportunity.completionRule)
    ) {
      throw new WorkPolicyError(
        "configuration_error",
        `Conflicting work opportunities share the task key ${opportunity.taskKey}`,
      );
    }
    prior.opportunity.evidence = mergeEvidence(prior.opportunity.evidence, opportunity.evidence);
  }
  return [...grouped.values()].sort((left, right) => {
    const sourceOrder = left.sourceKey.localeCompare(right.sourceKey);
    if (sourceOrder !== 0) return sourceOrder;
    const keyOrder = left.opportunity.taskKey.localeCompare(right.opportunity.taskKey);
    if (keyOrder !== 0) return keyOrder;
    return left.opportunity.ruleVersion - right.opportunity.ruleVersion;
  });
}

export function createOpportunityReconciler({
  repository,
}: {
  repository: OpportunityReconcilerRepository;
}): OpportunityReconciler {
  return {
    async reconcile({ actor, brandId, sources }) {
      if (typeof brandId !== "string" || brandId.trim().length === 0) {
        throw new WorkPolicyError("configuration_error", "Work opportunity brandId is required");
      }
      if (!Array.isArray(sources)) {
        throw new WorkPolicyError("configuration_error", "Work opportunity sources are required");
      }

      const sourceKeys = sources.map((source) => normalizedSourceKey(source.sourceKey));
      const collected: { sourceKey: string; value: unknown }[] = [];
      for (let index = 0; index < sources.length; index += 1) {
        const values = await sources[index].collect({
          actor,
          brandId: brandId as BrandId,
        });
        if (!Array.isArray(values)) {
          throw new WorkPolicyError(
            "configuration_error",
            `The ${sourceKeys[index]} work opportunity source returned an invalid collection`,
          );
        }
        for (const value of values) collected.push({ sourceKey: sourceKeys[index], value });
      }

      const opportunities = groupOpportunities(collected, actor);
      const listed = await repository.listTasks(brandId);
      if (listed === undefined)
        throw notFound("The repository could not list tasks for this brand");

      const byKey = new Map<string, WorkTaskView[]>();
      for (const item of listed) {
        const key = taskKey(item);
        const current = byKey.get(key) ?? [];
        current.push(item);
        byKey.set(key, current);
      }

      const reconciled: WorkTaskView[] = [];
      for (const scoped of opportunities) {
        const opportunity = scoped.opportunity;
        const key = opportunity.taskKey;
        const existing = byKey.get(key) ?? [];
        const sameRule = existing.find(
          (item) => storedRuleVersion(item) === opportunity.ruleVersion,
        );
        if (sameRule) {
          reconciled.push(sameRule);
          continue;
        }

        const highestRule = existing.reduce(
          (highest, item) => Math.max(highest, storedRuleVersion(item)),
          0,
        );
        if (highestRule > opportunity.ruleVersion) {
          const current = existing.reduce((latest, item) =>
            item.taskVersion > latest.taskVersion ? item : latest,
          );
          reconciled.push(current);
          continue;
        }

        const created = await repository.createTaskWithTriggerEvidence(
          brandId,
          taskInput(scoped, nextTaskVersion(existing)),
          clone(opportunity.evidence),
        );
        if (created === undefined) {
          throw notFound("The repository could not create the opportunity task");
        }

        const priorVersion = existing.filter(
          (item) => item.taskVersion < created.task.taskVersion && item.state === "suggested",
        );
        for (const item of priorVersion) {
          const dismissed = await dismissObsoleteSuggestedTask(
            repository,
            brandId,
            item,
            "A newer rule version replaced this opportunity.",
          );
          if (!dismissed) continue;
          const versions = byKey.get(key) ?? [];
          const index = versions.findIndex((candidate) => candidate.id === dismissed.id);
          if (index >= 0) versions.splice(index, 1, dismissed);
        }

        const next = byKey.get(key) ?? [];
        if (!next.some((item) => item.id === created.task.id)) next.push(created.task);
        byKey.set(key, next);
        reconciled.push(created.task);
      }

      const activeKeys = new Set(opportunities.map((item) => item.opportunity.taskKey));
      for (const item of listed) {
        if (
          item.state !== "suggested" ||
          activeKeys.has(taskKey(item)) ||
          !sourceKeys.some((sourceKey) => belongsToSource(item, sourceKey))
        ) {
          continue;
        }
        await dismissObsoleteSuggestedTask(
          repository,
          brandId,
          item,
          "The evidence source no longer reports this opportunity.",
        );
      }

      return reconciled;
    },
  };
}
