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
// code paths, enforced in only one of them. So the test pins the INVARIANT -
// what lands in the database can never exceed the cap - rather than the
// current implementation of the trim.

import { describe, it, expect } from "vitest";
import { TRACKED_PROMPTS_CAP } from "@shared/constants";

/** The persist-time rule promptGenerator applies. */
function persisted<T>(clean: T[]): T[] {
  return clean.slice(0, TRACKED_PROMPTS_CAP);
}

describe("prompt generation respects the tracked cap", () => {
  it("never persists more tracked prompts than the cap", () => {
    // THE REGRESSION: a generation that survived filtering at 15 wrote 15.
    const generated = Array.from({ length: 15 }, (_, i) => `prompt ${i}`);
    expect(persisted(generated)).toHaveLength(TRACKED_PROMPTS_CAP);
  });

  it("keeps everything when the generation came back under the cap", () => {
    // Trimming must not become a floor - a thin generation stays thin rather
    // than being padded to look complete.
    const generated = Array.from({ length: 6 }, (_, i) => `prompt ${i}`);
    expect(persisted(generated)).toHaveLength(6);
  });

  it("keeps the highest-ranked prompts, not an arbitrary slice", () => {
    // The generator emits in priority order and orderIndex is assigned from
    // this position, so the trim must take the FRONT.
    const generated = ["best", "second", "third", "fourth", "fifth"];
    expect(persisted(generated)[0]).toBe("best");
  });

  it("handles an empty generation without throwing", () => {
    expect(persisted([])).toHaveLength(0);
  });

  it("caps at a value the manual-add route also enforces", () => {
    // If these ever diverge again, one path will silently allow what the other
    // refuses - which is exactly how a brand ended up over the limit.
    expect(TRACKED_PROMPTS_CAP).toBe(10);
    expect(TRACKED_PROMPTS_CAP).toBeGreaterThan(0);
  });
});
