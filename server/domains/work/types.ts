import type {
  AwardDecision,
  CapabilityMilestone,
  EvidenceReference,
  LevelDefinition,
  LevelProgress,
  TaskCommand,
  TaskState,
  TaskType,
  VerificationMethod,
  WorkPolicyError,
} from "@shared/work";

export type BrandId = string & { readonly __brandId: unique symbol };
export type UserId = string & { readonly __userId: unique symbol };
export type WorkTaskId = string & { readonly __workTaskId: unique symbol };

export interface WorkTaskInput {
  id: WorkTaskId;
  brandId: BrandId;
  ownerId: UserId;
  type: TaskType;
  version: number;
  state: TaskState;
}

export interface WorkTaskTransition {
  from: TaskState;
  command: TaskCommand;
  to: TaskState;
}

export interface WorkEvidenceValidation {
  valid: true;
  references: readonly EvidenceReference[];
}

export interface SystemVerification {
  verification: VerificationMethod;
  verifiedAt: Date;
}

export interface CapabilityProgress {
  points: number;
  milestones: ReadonlySet<CapabilityMilestone>;
}

export interface WorkAwardInput {
  taskId: WorkTaskId;
  taskType: TaskType;
  taskVersion: number;
  cycleKey: string;
  ruleVersion: number;
  verification: VerificationMethod;
  evidence: readonly EvidenceReference[];
}

export type { AwardDecision, LevelDefinition, LevelProgress, WorkPolicyError };
