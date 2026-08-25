import { sql } from "drizzle-orm";
import type { RequestActor } from "../lib/requestActor";
import type { RequestRepositoryTransaction } from "./requestRepositoryTransaction";

export type RestrictedRequestRole = "venturecite_request" | "venturecite_content_request";

export async function setRestrictedRequestContext({
  actor,
  role,
  transaction,
}: {
  actor: RequestActor;
  role: RestrictedRequestRole;
  transaction: RequestRepositoryTransaction;
}): Promise<void> {
  if (role === "venturecite_request") {
    await transaction.execute(sql`set local role venturecite_request`);
  } else {
    await transaction.execute(sql`set local role venturecite_content_request`);
  }
  await transaction.execute(sql`select set_config('venturecite.user_id', ${actor.userId}, true)`);
  await transaction.execute(sql`set local statement_timeout = '5s'`);
}
