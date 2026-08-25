import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  outboxErrorCodeSchema,
  outboxProviderResultSchema,
  parseOutboxCommandPayload,
  type OutboxCommandKind,
  type OutboxCommandPayload,
  type OutboxProviderResult,
} from "@shared/outbox";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Database = Pick<typeof db, "transaction">;
const MIN_LEASE_SECONDS = 3;
const MAX_LEASE_SECONDS = 900;

export type EnqueueOutboxCommand = {
  kind: OutboxCommandKind;
  idempotencyKey: string;
  aggregateType: string;
  aggregateId: string;
  userId: string;
  brandId: string | null;
  payload: OutboxCommandPayload;
  maxAttempts: number;
  providerName: string;
  providerOperation: string;
  availableAt?: Date;
};
export type ClaimedOutboxCommand = {
  id: string;
  kind: OutboxCommandKind;
  status: "processing";
  idempotencyKey: string;
  aggregateType: string;
  aggregateId: string;
  userId: string | null;
  brandId: string | null;
  payload: OutboxCommandPayload;
  attemptCount: number;
  maxAttempts: number;
  availableAt: Date;
  leaseToken: string;
  leaseExpiresAt: Date;
  providerName: string;
  providerOperation: string;
  createdAt: Date;
};
export type ClaimedOrPendingCommand = Omit<
  ClaimedOutboxCommand,
  "status" | "leaseToken" | "leaseExpiresAt"
> & {
  status: "pending" | "processing";
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
};
export type OutboxRepository = {
  enqueueInTransaction(
    transaction: Transaction,
    input: EnqueueOutboxCommand,
  ): Promise<ClaimedOrPendingCommand>;
  claimNext(input: {
    leaseSeconds: number;
    kinds: readonly OutboxCommandKind[];
  }): Promise<ClaimedOutboxCommand | null>;
  renewLease(input: { id: string; leaseToken: string; leaseSeconds: number }): Promise<boolean>;
  markSucceeded(input: {
    id: string;
    leaseToken: string;
    providerReference: string;
    providerResult: OutboxProviderResult;
  }): Promise<boolean>;
  reschedule(input: {
    id: string;
    leaseToken: string;
    nextAvailableAt: Date;
    errorCode: import("@shared/outbox").OutboxErrorCode;
  }): Promise<{ kind: "pending" } | { kind: "dead_letter" } | { kind: "lost_lease" }>;
  moveToDeadLetter(input: {
    id: string;
    leaseToken: string;
    errorCode: import("@shared/outbox").OutboxErrorCode;
  }): Promise<boolean>;
  requestCancellation(input: { id: string }): Promise<boolean>;
  cancelClaimed(input: { id: string; leaseToken: string }): Promise<boolean>;
  isCancellationRequested(input: { id: string; leaseToken: string }): Promise<boolean>;
  cancelAggregate(input: { aggregateType: string; aggregateId: string }): Promise<number>;
};

export function createOutboxRepository(database: Database = db): OutboxRepository {
  return {
    enqueueInTransaction: (transaction, input) => enqueueFromDomainTransaction(transaction, input),
    claimNext: ({ leaseSeconds, kinds }) =>
      withWorkerTransaction(database, async (tx) => {
        assertLeaseSeconds(leaseSeconds);
        assertClaimKinds(kinds);
        const claimKinds = [...kinds];
        const result = await tx.execute(sql`
        with expired_final as (
          update public.outbox_commands
          set status = 'dead_letter',
              payload = '{}'::jsonb, completed_at = null,
              dead_lettered_at = now(),
              lease_token = null, lease_expires_at = null,
              last_error_code = coalesce(last_error_code, 'attempts_exhausted')
          where kind = any(${claimKinds}::text[])
            and status = 'processing' and lease_expires_at < now() and (attempt_count >= max_attempts or cancellation_requested_at is not null)
          returning id
        ), candidate as (
          select id from public.outbox_commands
          where kind = any(${claimKinds}::text[])
            and ((status = 'pending' and cancellation_requested_at is null and available_at <= now() and attempt_count < max_attempts)
             or (status = 'processing' and cancellation_requested_at is null and lease_expires_at < now() and attempt_count < max_attempts)
            )
          order by available_at, created_at for update skip locked limit 1
        )
        update public.outbox_commands command
        set status = 'processing', lease_token = gen_random_uuid(),
            lease_expires_at = now() + make_interval(secs => ${leaseSeconds}::integer),
            started_at = coalesce(started_at, now()), attempt_count = attempt_count + 1
        from candidate where command.id = candidate.id returning command.*
      `);
        const row = resultRows(result)[0];
        return row ? parseClaimedOutboxCommand(row) : null;
      }),
    renewLease: ({ id, leaseToken, leaseSeconds }) =>
      withWorkerTransaction(database, async (tx) => {
        assertLeaseSeconds(leaseSeconds);
        const result = await tx.execute(sql`
        update public.outbox_commands set lease_expires_at = now() + make_interval(secs => ${leaseSeconds}::integer)
        where id = ${id} and status = 'processing' and lease_expires_at > now() and lease_token = ${leaseToken}::uuid returning id
      `);
        return resultRows(result).length === 1;
      }),
    markSucceeded: ({ id, leaseToken, providerReference, providerResult }) =>
      withWorkerTransaction(database, async (tx) => {
        const result = await tx.execute(sql`
        update public.outbox_commands
        set status = 'succeeded', provider_reference = ${providerReference},
            provider_result = ${outboxProviderResultSchema.parse(providerResult)}::jsonb,
            payload = '{}'::jsonb, completed_at = now(), lease_token = null, lease_expires_at = null
        where id = ${id} and status = 'processing' and lease_expires_at > now() and lease_token = ${leaseToken}::uuid returning id
      `);
        return resultRows(result).length === 1;
      }),
    reschedule: ({ id, leaseToken, nextAvailableAt, errorCode }) =>
      withWorkerTransaction(database, async (tx) => {
        const safeErrorCode = outboxErrorCodeSchema.parse(errorCode);
        const result = await tx.execute(sql`
        update public.outbox_commands
        set status = case when cancellation_requested_at is not null or attempt_count >= max_attempts then 'dead_letter' else 'pending' end,
            available_at = case when cancellation_requested_at is not null or attempt_count >= max_attempts then available_at else ${nextAvailableAt} end,
            last_error_code = ${safeErrorCode}, payload = case when cancellation_requested_at is not null or attempt_count >= max_attempts then '{}'::jsonb else payload end,
            completed_at = null,
            dead_lettered_at = case when cancellation_requested_at is not null or attempt_count >= max_attempts then now() else null end,
            lease_token = null, lease_expires_at = null
        where id = ${id} and status = 'processing' and lease_expires_at > now() and lease_token = ${leaseToken}::uuid returning status
      `);
        const row = resultRows(result)[0];
        if (!row) return { kind: "lost_lease" };
        if (row.status === "dead_letter") return { kind: "dead_letter" };
        return { kind: "pending" };
      }),
    moveToDeadLetter: ({ id, leaseToken, errorCode }) =>
      withWorkerTransaction(database, async (tx) => {
        const safeErrorCode = outboxErrorCodeSchema.parse(errorCode);
        const result = await tx.execute(sql`
        update public.outbox_commands set status = 'dead_letter', last_error_code = ${safeErrorCode},
          payload = '{}'::jsonb, dead_lettered_at = now(), lease_token = null, lease_expires_at = null
        where id = ${id} and status = 'processing' and lease_expires_at > now() and lease_token = ${leaseToken}::uuid returning id
      `);
        return resultRows(result).length === 1;
      }),
    cancelAggregate: ({ aggregateType, aggregateId }) =>
      withWorkerTransaction(database, async (tx) => {
        const result = await tx.execute(sql`
        update public.outbox_commands
        set status = 'cancelled', payload = '{}'::jsonb, completed_at = now(),
            cancellation_requested_at = coalesce(cancellation_requested_at, now()),
            last_error_code = 'cancelled'
        where aggregate_type = ${aggregateType} and aggregate_id = ${aggregateId} and status = 'pending' returning id
      `);
        return resultRows(result).length;
      }),
    requestCancellation: ({ id }) =>
      withWorkerTransaction(database, async (tx) => {
        const result = await tx.execute(sql`
          update public.outbox_commands
          set cancellation_requested_at = coalesce(cancellation_requested_at, now())
          where id = ${id} and status = 'processing' and cancellation_requested_at is null returning id
        `);
        return resultRows(result).length === 1;
      }),
    cancelClaimed: ({ id, leaseToken }) =>
      withWorkerTransaction(database, async (tx) => {
        const result = await tx.execute(sql`
          update public.outbox_commands
          set status = 'cancelled', last_error_code = 'cancelled', payload = '{}'::jsonb,
              completed_at = now(), lease_token = null, lease_expires_at = null
          where id = ${id} and status = 'processing' and cancellation_requested_at is not null
            and lease_expires_at > now() and lease_token = ${leaseToken}::uuid returning id
        `);
        return resultRows(result).length === 1;
      }),
    isCancellationRequested: ({ id, leaseToken }) =>
      withWorkerTransaction(database, async (tx) => {
        const result = await tx.execute(sql`
          select cancellation_requested_at from public.outbox_commands
          where id = ${id} and status = 'processing' and lease_token = ${leaseToken}::uuid
        `);
        const row = resultRows(result)[0];
        return row ? row.cancellation_requested_at !== null : false;
      }),
  };
}

async function enqueueFromDomainTransaction(
  transaction: Transaction,
  input: EnqueueOutboxCommand,
): Promise<ClaimedOrPendingCommand> {
  assertEnqueueUserId(input.userId);
  const payload = parseOutboxCommandPayload(input.payload);
  if (payload.kind !== input.kind)
    throw new Error("Outbox command kind does not match its payload");
  const fingerprint = payloadFingerprint(payload);
  const result = await transaction.execute(sql`
    select id from private.enqueue_outbox_command(
      ${input.kind}, ${input.idempotencyKey}, ${input.aggregateType}, ${input.aggregateId},
      ${input.userId}, ${input.brandId}, ${payload}::jsonb, ${fingerprint}, ${input.maxAttempts},
      ${input.providerName}, ${input.providerOperation}, ${input.availableAt ?? null}::timestamptz
    )
  `);
  const id = resultRows(result)[0]?.id;
  if (typeof id !== "string") throw new Error("Outbox enqueue did not return a command");
  const row = resultRows(
    await transaction.execute(sql`select private.get_outbox_command(${id}) as command`),
  )[0]?.command;
  if (!row) throw new Error("Outbox enqueue result is not visible");
  return parsePendingOrClaimedCommand(row);
}

async function withWorkerTransaction<T>(
  database: Database,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(sql`set local role venturecite_outbox_worker`);
    await tx.execute(sql`set local statement_timeout = '5s'`);
    return work(tx);
  });
}
function payloadFingerprint(payload: OutboxCommandPayload): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}
function assertEnqueueUserId(userId: string): void {
  if (typeof userId !== "string" || userId.trim().length === 0)
    throw new Error("Outbox command userId must be a non-empty user id");
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}
function assertLeaseSeconds(value: number): void {
  if (!Number.isInteger(value) || value < MIN_LEASE_SECONDS || value > MAX_LEASE_SECONDS)
    throw new Error(
      `Outbox leaseSeconds must be an integer from ${MIN_LEASE_SECONDS} to ${MAX_LEASE_SECONDS}`,
    );
}
function assertClaimKinds(kinds: readonly OutboxCommandKind[]): void {
  if (kinds.length === 0) throw new Error("Outbox claim requires at least one command kind");
}
function parseClaimedOutboxCommand(value: unknown): ClaimedOutboxCommand {
  const command = parsePendingOrClaimedCommand(value);
  if (command.status !== "processing" || !command.leaseToken || !command.leaseExpiresAt)
    throw new Error("Claimed outbox command has no active lease");
  return {
    ...command,
    status: "processing",
    leaseToken: command.leaseToken,
    leaseExpiresAt: command.leaseExpiresAt,
  };
}
function parsePendingOrClaimedCommand(value: unknown): ClaimedOrPendingCommand {
  if (!value || typeof value !== "object") throw new Error("Outbox database result is invalid");
  const row = value as Record<string, unknown>;
  const payload = parseOutboxCommandPayload(row.payload);
  const status = stringField(row, "status");
  if (status !== "pending" && status !== "processing")
    throw new Error("Outbox database result is terminal");
  return {
    id: stringField(row, "id"),
    kind: payload.kind,
    status,
    idempotencyKey: stringField(row, "idempotency_key"),
    aggregateType: stringField(row, "aggregate_type"),
    aggregateId: stringField(row, "aggregate_id"),
    userId: nullableStringField(row, "user_id"),
    brandId: nullableStringField(row, "brand_id"),
    payload,
    attemptCount: numberField(row, "attempt_count"),
    maxAttempts: numberField(row, "max_attempts"),
    availableAt: dateField(row, "available_at"),
    leaseToken: nullableStringField(row, "lease_token"),
    leaseExpiresAt: nullableDateField(row, "lease_expires_at"),
    providerName: stringField(row, "provider_name"),
    providerOperation: stringField(row, "provider_operation"),
    createdAt: dateField(row, "created_at"),
  };
}
function resultRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (value && typeof value === "object" && "rows" in value && Array.isArray(value.rows))
    return value.rows as Array<Record<string, unknown>>;
  return [];
}
function stringField(row: Record<string, unknown>, name: string): string {
  if (typeof row[name] !== "string") throw new Error(`Outbox database result has invalid ${name}`);
  return row[name];
}
function nullableStringField(row: Record<string, unknown>, name: string): string | null {
  return row[name] === null ? null : stringField(row, name);
}
function numberField(row: Record<string, unknown>, name: string): number {
  if (typeof row[name] !== "number") throw new Error(`Outbox database result has invalid ${name}`);
  return row[name];
}
function dateField(row: Record<string, unknown>, name: string): Date {
  const value = row[name];
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) return date;
  }
  throw new Error(`Outbox database result has invalid ${name}`);
}
function nullableDateField(row: Record<string, unknown>, name: string): Date | null {
  return row[name] === null ? null : dateField(row, name);
}
