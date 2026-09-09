import { describe, expect, it, vi } from "vitest";
import type { RequestRepositoryTransaction } from "../../server/data/requestRepositoryTransaction";
import { createRequestActor } from "../../server/lib/requestActor";
import {
  createDatabaseWorkEvidenceAuthorizer,
  createWorkEvidenceReaders,
} from "../../server/domains/work/evidenceReaders";
import type { EvidenceReference, VerificationMethod } from "@shared/work";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BRAND_ID = "brand-a";
const ACTOR = createRequestActor(USER_ID);

const sourceReference = (
  overrides: Partial<Extract<EvidenceReference, { kind: "source" }>> = {},
) => ({
  kind: "source" as const,
  label: "Accepted source fact",
  sourceUrl: "https://example.test/facts",
  factId: "fact-a",
  scrapePageId: "page-a",
  canonicalUrl: "https://example.test/facts",
  retrievedAt: "2026-09-08T00:00:00.000Z",
  excerpt: "The stored fact excerpt.",
  ...overrides,
});

const artifactReference = (
  overrides: Partial<Extract<EvidenceReference, { kind: "artifact" }>> = {},
) => ({
  kind: "artifact" as const,
  label: "Tracked buyer-question generation",
  artifactId: "generation-a",
  version: 3,
  reviewedByUserId: USER_ID,
  coverage: "prompt-a,prompt-b",
  duplicateCheck: "generation-a",
  ...overrides,
});

const confirmationReference = (
  overrides: Partial<Extract<EvidenceReference, { kind: "confirmation" }>> = {},
) => ({
  kind: "confirmation" as const,
  label: "User confirmation",
  confirmedByUserId: USER_ID,
  note: "I confirmed the repair.",
  confirmedAt: "2026-09-08T00:00:00.000Z",
  ...overrides,
});

function transactionFor(...rows: Array<unknown[]>) {
  const execute = vi.fn();
  for (const result of rows) execute.mockResolvedValueOnce({ rows: result });
  return { execute } as unknown as RequestRepositoryTransaction;
}

function input(
  reference: EvidenceReference,
  verification: VerificationMethod = {
    kind: "human_confirmation",
    confirmedByUserId: USER_ID,
    note: "I confirmed the stored result.",
  },
) {
  return {
    actor: ACTOR,
    brandId: BRAND_ID,
    taskId: "task-a",
    taskVersion: 1,
    verification,
    evidence: [reference],
  };
}

describe("database work evidence readers", () => {
  it("authorizes an accepted fact from a completed successful scrape", async () => {
    const transaction = transactionFor([{}], [{}]);
    const authorizer = createDatabaseWorkEvidenceAuthorizer(transaction, ACTOR);

    await expect(authorizer(input(sourceReference()))).resolves.toBe("authorized");
    expect(transaction.execute).toHaveBeenCalledTimes(2);
  });

  it("returns not_found for a foreign or deleted brand record", async () => {
    const transaction = transactionFor([]);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.source({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: sourceReference(),
      }),
    ).resolves.toBe("not_found");
  });

  it("returns owned_unusable when the stored source record is incomplete", async () => {
    const transaction = transactionFor([{}], []);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.source({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: sourceReference(),
      }),
    ).resolves.toBe("owned_unusable");
  });

  it("returns owned_usable for a generation with tracked unpaused covered questions", async () => {
    const transaction = transactionFor([{}], [{}], [{ id: "prompt-a" }, { id: "prompt-b" }]);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.artifact({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: artifactReference(),
      }),
    ).resolves.toBe("owned_usable");
  });

  it("returns owned_unusable when a covered question is paused", async () => {
    const transaction = transactionFor([{}], [{}], [{ id: "prompt-a" }]);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.artifact({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: artifactReference(),
      }),
    ).resolves.toBe("owned_unusable");
  });

  it("returns not_found for a generation from another brand", async () => {
    const transaction = transactionFor([]);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.artifact({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: artifactReference(),
      }),
    ).resolves.toBe("not_found");
  });

  it("returns not_found for a generation version mismatch", async () => {
    const transaction = transactionFor([{}], []);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.artifact({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: artifactReference(),
      }),
    ).resolves.toBe("not_found");
  });

  it("returns owned_usable for a fact-record artifact", async () => {
    const transaction = transactionFor([{}]);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.artifact({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: artifactReference({
          artifactId: "fact-record:fact-a",
          coverage: "fact-a",
          duplicateCheck: "fact-a",
        }),
      }),
    ).resolves.toBe("owned_usable");
  });

  it("rejects an arbitrary system check identifier", async () => {
    const transaction = transactionFor([]);
    const authorizer = createDatabaseWorkEvidenceAuthorizer(transaction, ACTOR);

    await expect(
      authorizer(
        input(sourceReference(), {
          kind: "system_check",
          checkId: "arbitrary-check",
        }),
      ),
    ).resolves.toBe("invalid_evidence");
    expect(transaction.execute).not.toHaveBeenCalled();
  });

  it("returns owned_usable for a coherent confirmation", async () => {
    const transaction = transactionFor();
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.confirmation({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: confirmationReference(),
      }),
    ).resolves.toBe("owned_usable");
    expect(transaction.execute).not.toHaveBeenCalled();
  });

  it("returns owned_unusable when a confirmation names another user", async () => {
    const transaction = transactionFor();
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.confirmation({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: confirmationReference({ confirmedByUserId: "user-b" }),
      }),
    ).resolves.toBe("owned_unusable");
  });

  it("returns owned_unusable when a confirmation has a blank note", async () => {
    const transaction = transactionFor();
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.confirmation({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: confirmationReference({ note: "  \t" }),
      }),
    ).resolves.toBe("owned_unusable");
  });

  it("returns owned_unusable when a confirmation is in the future", async () => {
    const transaction = transactionFor();
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.confirmation({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: confirmationReference({ confirmedAt: "2099-01-01T00:00:00.000Z" }),
      }),
    ).resolves.toBe("owned_unusable");
  });
});
