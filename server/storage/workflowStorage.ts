import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import type { InsertWorkflowRun, WorkflowRun } from "@shared/schema";

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

  async getActiveRunsByUser(userId: string): Promise<WorkflowRun[]> {
    return db
      .select()
      .from(schema.workflowRuns)
      .where(
        and(
          eq(schema.workflowRuns.userId, userId),
          inArray(schema.workflowRuns.status, ["running", "pending"]),
        ),
      );
  },

  async updateRun(id: string, patch: Partial<WorkflowRun>): Promise<WorkflowRun | undefined> {
    const [row] = await db
      .update(schema.workflowRuns)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.workflowRuns.id, id))
      .returning();
    return row;
  },
};
