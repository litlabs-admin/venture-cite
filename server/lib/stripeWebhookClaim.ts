import { sql } from "drizzle-orm";
import { db } from "../db";

export type StripeWebhookClaim =
  { kind: "claimed"; token: string } | { kind: "busy" } | { kind: "complete" };

export type StripeWebhookLease = {
  assertOwned(): Promise<void>;
  finish(): Promise<boolean>;
  stop(): Promise<void>;
};

const DEFAULT_RENEWAL_INTERVAL_MS = 60_000;

export async function claimStripeWebhookEvent(
  eventId: string,
  eventType: string,
): Promise<StripeWebhookClaim> {
  const result: unknown = await db.execute(sql`
    insert into public.stripe_webhook_events (
      event_id,
      event_type,
      processing_started_at,
      processing_token
    )
    values (${eventId}, ${eventType}, now(), gen_random_uuid())
    on conflict (event_id) do update
    set event_type = excluded.event_type,
        processing_started_at = now(),
        processing_token = gen_random_uuid()
    where stripe_webhook_events.processed_at is null
      and (
        stripe_webhook_events.processing_started_at is null
        or stripe_webhook_events.processing_started_at < now() - interval '5 minutes'
      )
    returning processing_token
  `);
  const token = claimToken(result);
  if (token) return { kind: "claimed", token };

  const state: unknown = await db.execute(sql`
    select processed_at
    from public.stripe_webhook_events
    where event_id = ${eventId}
    limit 1
  `);
  return hasProcessedAt(state) ? { kind: "complete" } : { kind: "busy" };
}

export async function renewStripeWebhookEvent(eventId: string, token: string): Promise<boolean> {
  const result: unknown = await db.execute(sql`
    update public.stripe_webhook_events
    set processing_started_at = now()
    where event_id = ${eventId}
      and processing_token = ${token}
      and processed_at is null
    returning event_id
  `);
  return hasReturnedRow(result);
}

export async function completeStripeWebhookEvent(eventId: string, token: string): Promise<boolean> {
  const result: unknown = await db.execute(sql`
    update public.stripe_webhook_events
    set processed_at = now(),
        processing_started_at = null,
        processing_token = null
    where event_id = ${eventId}
      and processing_token = ${token}
      and processed_at is null
    returning event_id
  `);
  return hasReturnedRow(result);
}

export function maintainStripeWebhookClaim(
  eventId: string,
  token: string,
  renewalIntervalMs = DEFAULT_RENEWAL_INTERVAL_MS,
): StripeWebhookLease {
  let stopped = false;
  let ownsClaim = true;
  let renewalError: unknown;
  let pendingRenewal: Promise<void> | null = null;

  const renew = () => {
    if (stopped || pendingRenewal) return;

    const activeRenewal = (async () => {
      try {
        ownsClaim = await renewStripeWebhookEvent(eventId, token);
      } catch (error) {
        ownsClaim = false;
        renewalError = error;
      }
    })();
    pendingRenewal = activeRenewal;
    void activeRenewal.finally(() => {
      if (pendingRenewal === activeRenewal) pendingRenewal = null;
    });
  };

  const timer = setInterval(renew, renewalIntervalMs);
  timer.unref();

  const stop = async () => {
    if (!stopped) {
      stopped = true;
      clearInterval(timer);
    }
    if (pendingRenewal) await pendingRenewal;
  };

  return {
    async assertOwned() {
      if (pendingRenewal) await pendingRenewal;
      if (renewalError) throw renewalError;
      if (!ownsClaim) {
        throw new Error(`Stripe webhook event ${eventId} lost its processing claim`);
      }
    },
    async finish() {
      await stop();
      if (renewalError) throw renewalError;
      if (!ownsClaim) return false;
      return completeStripeWebhookEvent(eventId, token);
    },
    stop,
  };
}

function claimToken(result: unknown): string | null {
  const rows = resultRows(result);
  if (!Array.isArray(rows)) return null;
  const first = rows[0];
  if (!first || typeof first !== "object" || !("processing_token" in first)) return null;
  return typeof first.processing_token === "string" ? first.processing_token : null;
}

function hasProcessedAt(result: unknown): boolean {
  const rows = resultRows(result);
  if (!Array.isArray(rows)) return false;
  const first = rows[0];
  return Boolean(
    first && typeof first === "object" && "processed_at" in first && first.processed_at,
  );
}

function hasReturnedRow(result: unknown): boolean {
  const rows = resultRows(result);
  return Array.isArray(rows) && rows.length > 0;
}

function resultRows(result: unknown): unknown {
  if (!result || typeof result !== "object") return null;
  return "rows" in result ? result.rows : result;
}
