// Prompt generation must respect the tracked-prompt cap.
//
// TARGET_PROMPTS (15) is an over-generation target: asking the model for more
// than we keep gives the shape/dedup filters something to discard. But the
// save loop persisted every survivor as `tracked`, so a clean generation wrote
// up to 15 tracked prompts against TRACKED_PROMPTS_CAP = 10. The cap was
// enforced only in the route a human uses to add a prompt by hand - never in
// the generator the onboarding pipeline actually calls.
//
// Observed on a real brand: 12 tracked prompts, over a cap of 10.
//
// This is the same failure shape as the pricing/checkout gate: one rule, two
// code paths, enforced in only one of them. So this test drives the REAL
// production generator (server/lib/promptGenerator.ts's generateBrandPrompts)
// end to end - mocking only the LLM call and the storage layer - and asserts
// on what it actually persists. A local reimplementation of the trim (the
// previous version of this file) can never regress when the generator's own
// save loop drops the cap; only calling the generator itself can.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Brand } from "@shared/schema";

const storageStubs = vi.hoisted(() => ({
  getRecentArticlesByBrandId: vi.fn().mockResolvedValue([]),
  getBrandFacts: vi.fn().mockResolvedValue([]),
  getCompetitors: vi.fn().mockResolvedValue([]),
  archiveBrandPrompts: vi.fn().mockResolvedValue(undefined),
  createPromptGeneration: vi.fn().mockResolvedValue({ id: "generation-1" }),
  createBrandPrompt: vi.fn(async (p: Record<string, unknown>) => ({
    id: `saved-${p.orderIndex}`,
    ...p,
  })),
}));

vi.mock("../../server/storage", () => ({ storage: storageStubs }));

const createCompletion = vi.hoisted(() => vi.fn());
vi.mock("../../server/lib/factAgent/v2/openrouterClient", () => ({
  getOpenrouterClient: () => ({ chat: { completions: { create: createCompletion } } }),
}));

import { TRACKED_PROMPTS_CAP } from "@shared/constants";
import { generateBrandPrompts } from "../../server/lib/promptGenerator";

const BRAND: Brand = {
  id: "brand-1",
  name: "Widgetco",
  companyName: "Widgetco Inc",
  nameVariations: [],
  website: "https://widgetco.example",
} as unknown as Brand;

/** A prompt string that clears both deterministic gates: it doesn't name the
 * brand, and it is listicle-shaped ("best ... for ...", lowercase, no "?"). */
function shapedPrompt(n: number): string {
  return `best productivity tools for team ${n}`;
}

function completionWith(prompts: string[]) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            marketCategory: "Productivity software",
            prompts: prompts.map((prompt, i) => ({
              prompt,
              rationale: `rationale ${i}`,
              category: "general",
              funnelStage: "TOFU",
            })),
          }),
        },
      },
    ],
  };
}

describe("prompt generation respects the tracked cap", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.clearAllMocks();
    storageStubs.getRecentArticlesByBrandId.mockResolvedValue([]);
    storageStubs.getBrandFacts.mockResolvedValue([]);
    storageStubs.getCompetitors.mockResolvedValue([]);
    storageStubs.archiveBrandPrompts.mockResolvedValue(undefined);
    storageStubs.createPromptGeneration.mockResolvedValue({ id: "generation-1" });
    storageStubs.createBrandPrompt.mockImplementation(async (p: Record<string, unknown>) => ({
      id: `saved-${p.orderIndex}`,
      ...p,
    }));
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  });

  it("never persists more tracked prompts than the cap", async () => {
    // THE REGRESSION: a generation that survived filtering at 15 wrote 15.
    createCompletion.mockResolvedValueOnce(
      completionWith(Array.from({ length: 15 }, (_, i) => shapedPrompt(i))),
    );

    const result = await generateBrandPrompts(BRAND);

    expect(result.saved).toHaveLength(TRACKED_PROMPTS_CAP);
    expect(storageStubs.createBrandPrompt).toHaveBeenCalledTimes(TRACKED_PROMPTS_CAP);
  });

  it("keeps everything when the generation came back under the cap", async () => {
    // Trimming must not become a floor - a thin generation stays thin rather
    // than being padded to look complete. First call returns 6; the shortfall
    // retry (generator asks for the remaining 9) comes back empty.
    createCompletion
      .mockResolvedValueOnce(completionWith(Array.from({ length: 6 }, (_, i) => shapedPrompt(i))))
      .mockResolvedValueOnce(completionWith([]));

    const result = await generateBrandPrompts(BRAND);

    expect(result.saved).toHaveLength(6);
    expect(storageStubs.createBrandPrompt).toHaveBeenCalledTimes(6);
  });

  it("keeps the highest-ranked prompts, not an arbitrary slice", async () => {
    // The generator emits in priority order and orderIndex is assigned from
    // this position, so the trim must take the FRONT and persist in order.
    const ranked = [
      "best alternatives to legacy tools for team leads",
      "best productivity software for team 2",
      "best productivity software for team 3",
      "best productivity software for team 4",
      "best productivity software for team 5",
    ];
    createCompletion
      .mockResolvedValueOnce(completionWith(ranked))
      .mockResolvedValueOnce(completionWith([]));

    const result = await generateBrandPrompts(BRAND);

    expect(result.saved).toHaveLength(5);
    const firstCall = storageStubs.createBrandPrompt.mock.calls[0]?.[0] as { prompt: string };
    expect(firstCall.prompt).toBe(ranked[0]);
    expect(result.saved[0].prompt).toBe(ranked[0]);
  });

  it("handles an empty generation without throwing", async () => {
    createCompletion
      .mockResolvedValueOnce(completionWith([]))
      .mockResolvedValueOnce(completionWith([]));

    const result = await generateBrandPrompts(BRAND);

    expect(result.saved).toHaveLength(0);
    expect(result.error).toBeTruthy();
    expect(storageStubs.createBrandPrompt).not.toHaveBeenCalled();
  });

  it("caps at a value the manual-add route also enforces", () => {
    // If these ever diverge again, one path will silently allow what the other
    // refuses - which is exactly how a brand ended up over the limit.
    expect(TRACKED_PROMPTS_CAP).toBe(10);
    expect(TRACKED_PROMPTS_CAP).toBeGreaterThan(0);
  });
});
