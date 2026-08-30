import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { OutboxCommandPayload } from "../../shared/outbox";

const stubs = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../server/db", () => ({ db: { execute: stubs.execute } }));

const { createOutboxRepository } = await import("../../server/outbox/outboxRepository");

beforeEach(() => vi.clearAllMocks());

describe("outbox repository", () => {
  it("does not expose a direct worker enqueue producer", () => {
    const repository = createOutboxRepository(fakeDatabase());

    expect(repository).not.toHaveProperty("enqueue");
    expect(repository.enqueueInTransaction).toEqual(expect.any(Function));
  });

  it("claims one ready or expired command with skip locked", async () => {
    stubs.execute.mockResolvedValue({ rows: [] });
    const repository = createOutboxRepository(fakeDatabase());

    await expect(
      repository.claimNext({ leaseSeconds: 120, kinds: ["content_cost.record"] }),
    ).resolves.toBeNull();
    const statement = executedSql().find((text) => text.includes("for update skip locked")) ?? "";
    expect(statement).toContain("for update skip locked");
    expect(statement).toContain("status = 'pending'");
    expect(statement).toContain("lease_expires_at < now()");
    expect(statement).toContain("attempt_count = attempt_count + 1");
    expect(statement).toContain("kind = any");
  });

  it("excludes a row that has exhausted its retry budget from both claim branches", async () => {
    // .audit/B6/B6b-02-mutation-concurrency.md (3c): a prior version of this
    // test checked four substrings across the whole query but never checked
    // for "attempt_count < max_attempts" anywhere, so deleting that bound
    // from BOTH the 'pending' and 'processing' arms of the candidate CTE -
    // the actual cap that stops a poisoned row from retrying forever - left
    // every test in this file green. Scoped (not whole-query) substring
    // checks close that hole: each arm is sliced out individually so a
    // deletion from either one fails here even though the other arm still
    // contains the phrase.
    stubs.execute.mockResolvedValue({ rows: [] });
    const repository = createOutboxRepository(fakeDatabase());

    await repository.claimNext({ leaseSeconds: 120, kinds: ["content_cost.record"] });
    const statement = executedSql().find((text) => text.includes("for update skip locked")) ?? "";

    // The candidate CTE is the second `status = 'processing'` occurrence -
    // the first is the unrelated expired_final dead-letter-on-expiry branch.
    const candidateCteStart = statement.indexOf("candidate as (");
    expect(candidateCteStart).toBeGreaterThanOrEqual(0);
    const candidateCte = statement.slice(candidateCteStart);
    const pendingArmStart = candidateCte.indexOf("status = 'pending'");
    const processingArmStart = candidateCte.indexOf("status = 'processing'");
    const armsEnd = candidateCte.indexOf("order by available_at");
    expect(pendingArmStart).toBeGreaterThanOrEqual(0);
    expect(processingArmStart).toBeGreaterThan(pendingArmStart);
    expect(armsEnd).toBeGreaterThan(processingArmStart);

    const pendingArm = candidateCte.slice(pendingArmStart, processingArmStart);
    const processingArm = candidateCte.slice(processingArmStart, armsEnd);
    expect(pendingArm).toContain("attempt_count < max_attempts");
    expect(processingArm).toContain("attempt_count < max_attempts");
  });

  it("rejects a mismatched payload before it reaches the database", async () => {
    const repository = createOutboxRepository(fakeDatabase());

    await expect(
      repository.enqueueInTransaction(fakeTransaction(), {
        kind: "content_cost.record",
        idempotencyKey: "cost:job-1:response-1",
        aggregateType: "content_generation_job",
        aggregateId: "job-1",
        userId: "user-1",
        brandId: null,
        payload: {
          kind: "openai.create_response",
          contentJobId: "job-1",
          inputReference: "input-1",
        },
        maxAttempts: 3,
        providerName: "internal",
        providerOperation: "record_content_cost",
      }),
    ).rejects.toThrow("does not match");
    expect(executedSql()).not.toContain(
      expect.stringContaining("insert into public.outbox_commands"),
    );
  });

  it("rejects a null transactional producer user before it reaches the database", async () => {
    const repository = createOutboxRepository(fakeDatabase());

    // @ts-expect-error The producer contract requires an owning user.
    await expect(
      repository.enqueueInTransaction(fakeTransaction(), {
        kind: "stripe.create_customer",
        idempotencyKey: "customer:request-1",
        aggregateType: "brand",
        aggregateId: "brand-1",
        userId: null,
        brandId: "brand-1",
        payload: { kind: "stripe.create_customer", customerRequestId: "request-1" },
        maxAttempts: 3,
        providerName: "stripe",
        providerOperation: "create_customer",
      }),
    ).rejects.toThrow("Outbox command userId must be a non-empty user id");
    expect(executedSql()).not.toContain(
      expect.stringContaining("insert into public.outbox_commands"),
    );
  });

  it("dead-letters when a claimed command has exhausted its retry budget", async () => {
    stubs.execute.mockResolvedValue({ rows: [{ status: "dead_letter" }] });
    const repository = createOutboxRepository(fakeDatabase());

    await expect(
      repository.reschedule({
        id: "command-1",
        leaseToken: "00000000-0000-4000-8000-000000000001",
        nextAvailableAt: new Date("2026-08-20T00:00:00Z"),
        errorCode: "provider_unavailable",
      }),
    ).resolves.toEqual({ kind: "dead_letter" });
    expect(executedSql().some((text) => text.includes("attempt_count >= max_attempts"))).toBe(true);
  });

  it("dead-letters an in-flight retry after cancellation was requested", async () => {
    stubs.execute.mockResolvedValue({ rows: [{ status: "dead_letter" }] });
    const repository = createOutboxRepository(fakeDatabase());

    await expect(
      repository.reschedule({
        id: "command-1",
        leaseToken: "00000000-0000-4000-8000-000000000001",
        nextAvailableAt: new Date("2026-08-20T00:00:00Z"),
        errorCode: "cancelled",
      }),
    ).resolves.toEqual({ kind: "dead_letter" });
  });

  it("renews a live lease even after cancellation was requested", async () => {
    stubs.execute.mockResolvedValue({ rows: [{ id: "command-1" }] });
    const repository = createOutboxRepository(fakeDatabase());

    await expect(
      repository.renewLease({
        id: "command-1",
        leaseToken: "00000000-0000-4000-8000-000000000001",
        leaseSeconds: 120,
      }),
    ).resolves.toBe(true);
    const statement = executedSql().find((text) => text.includes("set lease_expires_at")) ?? "";
    expect(statement).not.toContain("cancellation_requested_at is null");
  });

  it("requires an active lease when finalizing a claimed cancellation", async () => {
    stubs.execute.mockResolvedValue({ rows: [] });
    const repository = createOutboxRepository(fakeDatabase());

    await expect(
      repository.cancelClaimed({
        id: "command-1",
        leaseToken: "00000000-0000-4000-8000-000000000001",
      }),
    ).resolves.toBe(false);
    const statement = executedSql().find((text) => text.includes("status = 'cancelled'")) ?? "";
    expect(statement).toContain("cancellation_requested_at is not null");
    expect(statement).toContain("lease_expires_at > now()");
  });

  it("uses the same fingerprint for equivalent JSON key orders", async () => {
    let storedFingerprint = "";
    const stored = {
      id: "command-1",
      kind: "content_cost.record",
      status: "pending",
      idempotency_key: "cost:job-1:response-1",
      aggregate_type: "content_generation_job",
      aggregate_id: "job-1",
      user_id: "user-1",
      brand_id: null,
      payload: {
        kind: "content_cost.record",
        contentJobId: "job-1",
        providerResponseId: "response-1",
        service: "openai",
        model: "gpt-test",
        tokensIn: 10,
        tokensOut: 20,
      },
      payload_fingerprint: "",
      attempt_count: 0,
      max_attempts: 3,
      available_at: new Date("2026-08-20T00:00:00Z"),
      lease_token: null,
      lease_expires_at: null,
      provider_name: "internal",
      provider_operation: "record_content_cost",
      created_at: new Date("2026-08-20T00:00:00Z"),
    };
    stubs.execute.mockImplementation(async (statement: unknown) => {
      const query = new PgDialect().sqlToQuery(statement as SQL);
      if (query.sql.includes("select id from private.enqueue_outbox_command")) {
        storedFingerprint = String(query.params[7]);
        stored.payload_fingerprint = storedFingerprint;
        return { rows: [{ id: "command-1" }] };
      }
      if (query.sql.includes("select private.get_outbox_command"))
        return { rows: [{ command: stored }] };
      return { rows: [] };
    });
    const repository = createOutboxRepository(fakeDatabase());
    const first = {
      kind: "content_cost.record",
      contentJobId: "job-1",
      providerResponseId: "response-1",
      service: "openai",
      model: "gpt-test",
      tokensIn: 10,
      tokensOut: 20,
    } satisfies OutboxCommandPayload;
    const second = {
      tokensOut: 20,
      model: "gpt-test",
      service: "openai",
      providerResponseId: "response-1",
      kind: "content_cost.record",
      tokensIn: 10,
      contentJobId: "job-1",
    } satisfies OutboxCommandPayload;

    await expect(
      repository.enqueueInTransaction(fakeTransaction(), commandFor(first)),
    ).resolves.toMatchObject({ id: "command-1" });
    await expect(
      repository.enqueueInTransaction(fakeTransaction(), commandFor(second)),
    ).resolves.toMatchObject({ id: "command-1" });

    const fingerprints = insertQueries().map((query) => query.params[7]);
    expect(fingerprints).toHaveLength(2);
    expect(fingerprints[0]).toBe(fingerprints[1]);
    expect(storedFingerprint).toBe(fingerprints[0]);
  });
});

function commandFor(payload: Extract<OutboxCommandPayload, { kind: "content_cost.record" }>) {
  return {
    kind: "content_cost.record",
    idempotencyKey: "cost:job-1:response-1",
    aggregateType: "content_generation_job",
    aggregateId: "job-1",
    userId: "user-1",
    brandId: null,
    payload,
    maxAttempts: 3,
    providerName: "internal",
    providerOperation: "record_content_cost",
  };
}

function sqlText(statement: unknown): string {
  return new PgDialect()
    .sqlToQuery(statement as SQL)
    .sql.replace(/\s+/g, " ")
    .trim();
}

function executedSql(): string[] {
  return stubs.execute.mock.calls.map((call) => sqlText(call[0]));
}

function insertQueries(): Array<{ params: unknown[] }> {
  return stubs.execute.mock.calls
    .map((call) => new PgDialect().sqlToQuery(call[0] as SQL))
    .filter((query) => query.sql.includes("select id from private.enqueue_outbox_command"));
}

function fakeTransaction() {
  return { execute: stubs.execute } as never;
}

function fakeDatabase() {
  return {
    transaction: async (
      work: (transaction: { execute: typeof stubs.execute }) => Promise<unknown>,
    ) => work({ execute: stubs.execute }),
  } as never;
}
