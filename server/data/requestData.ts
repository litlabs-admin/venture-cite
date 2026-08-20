import { sql } from "drizzle-orm";
import { db } from "../db";
import type { RequestActor } from "../lib/requestActor";

export type RequestTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type RequestData = {
  forUser<T>(
    actor: RequestActor,
    work: (transaction: RequestTransaction) => Promise<T>,
  ): Promise<T>;
};

export function createRequestData(database: typeof db): RequestData {
  return {
    async forUser<T>(
      actor: RequestActor,
      work: (transaction: RequestTransaction) => Promise<T>,
    ): Promise<T> {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`set local role venturecite_request`);
        await transaction.execute(
          sql`select set_config('venturecite.user_id', ${actor.userId}, true)`,
        );
        await transaction.execute(sql`set local statement_timeout = '5s'`);
        return work(transaction);
      });
    },
  };
}

export const requestData = createRequestData(db);
