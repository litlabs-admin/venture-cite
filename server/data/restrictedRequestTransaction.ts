import { sql } from "drizzle-orm";
import type { RequestActor } from "../lib/requestActor";
import type { RequestRepositoryTransaction } from "./requestRepositoryTransaction";

export type RestrictedRequestRole =
  "venturecite_request" | "venturecite_content_request" | "venturecite_entity_request";

export async function setRestrictedRequestContext({
  actor,
  role,
  transaction,
}: {
  actor: RequestActor;
  role: RestrictedRequestRole;
  transaction: RequestRepositoryTransaction;
}): Promise<void> {
  // Explicit switch, not an if/else default: an unrecognized role must fail
  // loudly rather than silently falling back to whichever role happened to
  // be the else branch. That silent-fallback shape is exactly what let this
  // helper admit only two roles while looking like it handled the general
  // case - see the entity-request migration (0124/0125) that needed a third.
  switch (role) {
    case "venturecite_request":
      await transaction.execute(sql`set local role venturecite_request`);
      break;
    case "venturecite_content_request":
      await transaction.execute(sql`set local role venturecite_content_request`);
      break;
    case "venturecite_entity_request":
      await transaction.execute(sql`set local role venturecite_entity_request`);
      break;
    default: {
      const unreachable: never = role;
      throw new Error(`Unsupported restricted request role: ${String(unreachable)}`);
    }
  }
  await transaction.execute(sql`select set_config('venturecite.user_id', ${actor.userId}, true)`);
  await transaction.execute(sql`set local statement_timeout = '5s'`);
}
