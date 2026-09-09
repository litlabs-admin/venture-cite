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

const decisionReference = (
  overrides: Partial<Extract<EvidenceReference, { kind: "decision" }>> = {},
) => ({
  kind: "decision" as const,
  label: "Outcome review decision",
  decisionId: "review-a",
  reviewPeriod: "2026-09",
  decision: "improvement",
  basedOnMeasurementId: "ranking-a",
  ...overrides,
});

const faultRepairReference = (
  overrides: Partial<Extract<EvidenceReference, { kind: "fault_repair" }>> = {},
) => ({
  kind: "fault_repair" as const,
  label: "Verified fault repair",
  faultId: "fault-a",
  beforeCheckId: "ranking-before",
  afterCheckId: "ranking-after",
  checkedAt: "2026-09-08T00:00:00.000Z",
  ...overrides,
});

const authoredWorkReference = (
  overrides: Partial<Extract<EvidenceReference, { kind: "authored_work" }>> = {},
) => ({
  kind: "authored_work" as const,
  label: "Published community submission",
  submissionId: "submission-a",
  destinationUrl: "https://www.example.test/community-post/",
  authoredByUserId: USER_ID,
  submittedAt: "2026-09-08T00:00:00.000Z",
  ...overrides,
});

const experimentReference = (
  overrides: Partial<Extract<EvidenceReference, { kind: "experiment" }>> = {},
) => ({
  kind: "experiment" as const,
  label: "Visibility experiment",
  experimentId: "content-a",
  hypothesis: "A comparison page improves citations.",
  baselineMeasurementId: "baseline-a",
  changedAt: "2026-09-04T00:00:00.000Z",
  laterMeasurementId: "later-a",
  conclusion: "The later run showed an improvement.",
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

  it("returns owned_usable for a matching outcome review", async () => {
    const transaction = transactionFor([{}], [{}]);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.decision({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: decisionReference(),
      }),
    ).resolves.toBe("owned_usable");
  });

  it("returns owned_unusable when an outcome review field disagrees", async () => {
    const transaction = transactionFor([{}], []);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.decision({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: decisionReference(),
      }),
    ).resolves.toBe("owned_unusable");
  });

  it("returns not_found for an outcome review from another brand", async () => {
    const transaction = transactionFor([]);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.decision({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: decisionReference(),
      }),
    ).resolves.toBe("not_found");
  });

  it("returns owned_usable for a verified repair with completed ranking checks", async () => {
    const transaction = transactionFor([{}], [{}], [{}], [{}]);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.fault_repair({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: faultRepairReference(),
      }),
    ).resolves.toBe("owned_usable");
  });

  it("returns owned_unusable when a stored repair field disagrees", async () => {
    const transaction = transactionFor([{}], []);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.fault_repair({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: faultRepairReference(),
      }),
    ).resolves.toBe("owned_unusable");
  });

  it("returns not_found for a repair from another brand", async () => {
    const transaction = transactionFor([]);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.fault_repair({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: faultRepairReference(),
      }),
    ).resolves.toBe("not_found");
  });

  it("returns owned_unusable when the resolved ranking run never completed", async () => {
    const transaction = transactionFor([{}], [{}], [{}], []);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.fault_repair({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: faultRepairReference(),
      }),
    ).resolves.toBe("owned_unusable");
  });

  it("returns owned_usable for a posted community submission with a normalized URL", async () => {
    const transaction = transactionFor(
      [{ kind: "community_post" }],
      [
        {
          destination_url: "https://example.test/community-post",
          submitted_at: "2026-09-08T00:00:00.000Z",
          status: "posted",
        },
      ],
    );
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.authored_work({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: authoredWorkReference(),
      }),
    ).resolves.toBe("owned_usable");
  });

  it("returns owned_usable for contacted listicle outreach", async () => {
    const transaction = transactionFor(
      [{ kind: "listicle" }],
      [{ destination_url: "https://example.test/community-post", outreach_status: "contacted" }],
    );
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.authored_work({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: authoredWorkReference(),
      }),
    ).resolves.toBe("owned_usable");
  });

  it("returns owned_unusable when a submitted work field disagrees", async () => {
    const transaction = transactionFor(
      [{ kind: "community_post" }],
      [
        {
          destination_url: "https://example.test/other-post",
          submitted_at: "2026-09-08T00:00:00.000Z",
          status: "posted",
        },
      ],
    );
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.authored_work({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: authoredWorkReference(),
      }),
    ).resolves.toBe("owned_unusable");
  });

  it("returns not_found for submitted work from another brand", async () => {
    const transaction = transactionFor([]);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.authored_work({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: authoredWorkReference(),
      }),
    ).resolves.toBe("not_found");
  });

  it("returns owned_usable for a measured experiment after a published change", async () => {
    const transaction = transactionFor([{}], [{}]);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.experiment({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: experimentReference(),
      }),
    ).resolves.toBe("owned_usable");
  });

  it("returns owned_unusable when an experiment field disagrees", async () => {
    const transaction = transactionFor([{}], []);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.experiment({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: experimentReference({ conclusion: "  " }),
      }),
    ).resolves.toBe("owned_unusable");
  });

  it("returns not_found for an experiment from another brand", async () => {
    const transaction = transactionFor([]);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.experiment({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: experimentReference(),
      }),
    ).resolves.toBe("not_found");
  });

  it("returns owned_unusable when the later measurement predates the change", async () => {
    const transaction = transactionFor([{}], []);
    const readers = createWorkEvidenceReaders(transaction, ACTOR);

    await expect(
      readers.experiment({
        actor: ACTOR,
        brandId: BRAND_ID,
        taskId: "task-a",
        taskVersion: 1,
        reference: experimentReference(),
      }),
    ).resolves.toBe("owned_unusable");
  });
});
