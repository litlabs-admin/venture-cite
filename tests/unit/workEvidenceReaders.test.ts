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

  it("rejects mismatched identifiers without using submitted evidence as proof", async () => {
    const transaction = transactionFor([]);
    const authorizer = createDatabaseWorkEvidenceAuthorizer(transaction, ACTOR);
    const submittedArtifact: EvidenceReference = {
      kind: "artifact",
      label: "User submitted artifact",
      artifactId: "arbitrary",
      version: 1,
      reviewedByUserId: USER_ID,
      coverage: "facts",
      duplicateCheck: "passed",
    };

    await expect(authorizer(input(submittedArtifact))).resolves.toBe("invalid_evidence");
    expect(transaction.execute).not.toHaveBeenCalled();
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
});
