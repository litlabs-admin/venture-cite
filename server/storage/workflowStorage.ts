import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import type {
  InsertWorkflowRun,
  WorkflowRun,
  InsertWorkflowApproval,
  WorkflowApproval,
} from "@shared/schema";

export type WorkflowRunFilters = {
  status?: string;
  workflowKey?: string;
};

export const workflowStorage = {
  async createRun(data: InsertWorkflowRun): Promise<WorkflowRun> {
    const [row] = await db.insert(schema.workflowRuns).values(data).returning();
    return row;
  },

  async getRun(id: string): Promise<WorkflowRun | undefined> {
    const [row] = await db
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, id))
      .limit(1);
    return row;
  },

  async getRunsByBrand(brandId: string, filters: WorkflowRunFilters = {}): Promise<WorkflowRun[]> {
    const clauses = [eq(schema.workflowRuns.brandId, brandId)];
    if (filters.status) clauses.push(eq(schema.workflowRuns.status, filters.status));
    if (filters.workflowKey) clauses.push(eq(schema.workflowRuns.workflowKey, filters.workflowKey));
    return db
      .select()
      .from(schema.workflowRuns)
      .where(and(...clauses))
      .orderBy(desc(schema.workflowRuns.createdAt));
  },

  async getActiveRuns(): Promise<WorkflowRun[]> {
    return db
      .select()
      .from(schema.workflowRuns)
      .where(inArray(schema.workflowRuns.status, ["running", "pending"]));
  },

  async updateRun(id: string, patch: Partial<WorkflowRun>): Promise<WorkflowRun | undefined> {
    const [row] = await db
      .update(schema.workflowRuns)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.workflowRuns.id, id))
      .returning();
    return row;
  },

  async createApproval(data: InsertWorkflowApproval): Promise<WorkflowApproval> {
    const [row] = await db.insert(schema.workflowApprovals).values(data).returning();
    return row;
  },

  async getPendingApproval(
    runId: string,
    stepIndex: number,
  ): Promise<WorkflowApproval | undefined> {
    const rows = await db
      .select()
      .from(schema.workflowApprovals)
      .where(
        and(
          eq(schema.workflowApprovals.runId, runId),
          eq(schema.workflowApprovals.stepIndex, stepIndex),
        ),
      )
      .orderBy(desc(schema.workflowApprovals.createdAt));
    return rows.find((r) => r.respondedAt == null);
  },

  async respondToApproval(
    id: string,
    decision: "approved" | "rejected",
    respondedAt: Date,
  ): Promise<WorkflowApproval | undefined> {
    const [row] = await db
      .update(schema.workflowApprovals)
      .set({ decision, respondedAt })
      .where(eq(schema.workflowApprovals.id, id))
      .returning();
    return row;
  },
};
