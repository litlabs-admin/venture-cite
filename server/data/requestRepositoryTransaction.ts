import type { db } from "../db";

export type RequestRepositoryTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
