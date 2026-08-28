import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import type { WorkflowRun } from "@shared/schema";
import { jobsStorage } from "./jobsStorage";

export type WorkflowRunFilters = {
  status?: string;
  workflowKey?: string;
};

export const workflowStorage = {
  ...jobsStorage,

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
};
