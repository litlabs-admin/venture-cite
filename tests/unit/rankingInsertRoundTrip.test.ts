import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: {
    insert: stubs.insert,
    select: stubs.select,
    execute: stubs.execute,
  },
}));

import * as schema from "../../shared/schema";
import { competitorsStorage } from "../../server/storage/competitorsStorage";

function insertBuilder(row: unknown) {
  const builder = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    returning: vi.fn().mockResolvedValue([row]),
  };
  builder.values.mockReturnValue(builder);
  builder.onConflictDoNothing.mockReturnValue(builder);
  builder.onConflictDoUpdate.mockReturnValue(builder);
  return builder;
}

describe("ranking insert round trips", () => {
  let storage: typeof competitorsStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = competitorsStorage;
    stubs.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });
  });

  // This verifies that the method issues one insert builder call with an
  // onConflictDoUpdate and performs no follow-up select. It does not verify
  // SQL correctness.
  it("uses one insert upsert without a follow-up select", async () => {
    const returnedRow = { id: "competitor-ranking-1", competitorId: "competitor-1" };
    const builder = insertBuilder(returnedRow);
    stubs.insert.mockReturnValue(builder);

    const result = await storage.createCompetitorGeoRanking({
      competitorId: "competitor-1",
      runId: "run-1",
      brandPromptId: "prompt-1",
      aiPlatform: "openai",
      isCited: undefined,
      rank: undefined,
      relevanceScore: undefined,
      citationContext: undefined,
      citingOutletUrl: undefined,
      sentiment: undefined,
    });

    expect(result).toBe(returnedRow);
    expect(stubs.insert).toHaveBeenCalledOnce();
    expect(stubs.execute).not.toHaveBeenCalled();
    expect(stubs.select).not.toHaveBeenCalled();
    expect(builder.values).toHaveBeenCalledWith({
      competitorId: "competitor-1",
      runId: "run-1",
      brandPromptId: "prompt-1",
      aiPlatform: "openai",
      isCited: 0,
      rank: null,
      relevanceScore: null,
      citationContext: null,
      citingOutletUrl: null,
      sentiment: null,
    });
    expect(builder.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: [
          schema.competitorGeoRankings.competitorId,
          schema.competitorGeoRankings.runId,
          schema.competitorGeoRankings.brandPromptId,
          schema.competitorGeoRankings.aiPlatform,
        ],
        set: expect.objectContaining({
          isCited: expect.anything(),
          rank: expect.anything(),
          relevanceScore: expect.anything(),
          citationContext: expect.anything(),
          citingOutletUrl: expect.anything(),
          sentiment: expect.anything(),
          checkedAt: expect.anything(),
        }),
      }),
    );
  });
});
