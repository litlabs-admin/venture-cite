// Validates the listicle-shape gate against the measured 15-prompt citation
// run (see server/lib/promptShape.ts header). Shape controls whether an AI
// answer names vendors (citable) or explains a concept (never citable).

import { describe, it, expect } from "vitest";
import { checkPromptShape, restoreProperNouns } from "../../server/lib/promptShape";

// All measured prompts except the 0-yield one. The 0-yield prompt is a
// deliberate BAD example - it is asserted separately below as a required
// rejection (abstract_qualifier), matching why it produced zero citations.
const MEASURED_PASSING_PROMPTS = [
  "top rated conversational ai platforms for large call centers",
  "leading ai solutions for handling customer service phone calls",
  "compare leading ai voice automation software for business operations",
  "compare automated cx platforms for high volume enterprise support",
  "best human like ai voice agents for enterprise scale",
  "top conversational ai tools for improving customer experience metrics",
  "best ai voice agents for automated it service desks",
  "best alternatives to traditional bpo using autonomous ai agents",
  "best ai customer service agents for complex support workflows",
  "top compliant ai calling software for legal and healthcare",
  "leading encrypted ai voice solutions for sensitive data handling",
  "best ai communication tools meeting strict enterprise compliance standards",
  "best secure ai voice platforms with pii redaction features",
  "best enterprise software for automated customer interaction and support",
  // From the user's own working set. It carries no plural category noun -
  // "alternatives" is the trigger. An earlier rule rejected it, which would
  // have thrown away a prompt shape the user relies on.
  "best alternatives for scaling it support with voice ai",
  "top ai calling platforms that integrate with enterprise data",
  "best customizable ai voice agents for existing business workflows",
];

describe("checkPromptShape", () => {
  it("passes every measured listicle-shaped prompt", () => {
    for (const prompt of MEASURED_PASSING_PROMPTS) {
      expect(checkPromptShape(prompt), prompt).toBeNull();
    }
  });

  it("rejects the measured 0-yield essay-trigger prompt as abstract_qualifier", () => {
    expect(checkPromptShape("compare enterprise ai agents with built in security guardrails")).toBe(
      "abstract_qualifier",
    );
  });

  it("rejects question forms", () => {
    expect(checkPromptShape("What should enterprises look for in AI voice automation?")).toBe(
      "question_form",
    );
    expect(checkPromptShape("Which platforms can our team use?")).toBe("question_form");
  });

  it("rejects too-short prompts", () => {
    expect(checkPromptShape("best")).toBe("too_short");
  });

  it("rejects prompts with no opener", () => {
    expect(checkPromptShape("enterprise ai voice agents for large call centers")).toBe("no_opener");
  });

  it("passes the natural, unpadded alternatives-to-competitor form", () => {
    expect(
      checkPromptShape("best alternatives to PolyAI for enterprise call center workflows"),
    ).toBeNull();
  });
});

describe("restoreProperNouns", () => {
  it("restores a competitor name split across two words", () => {
    expect(restoreProperNouns("compare cognigy vs kore ai platforms", ["Cognigy", "Kore.ai"])).toBe(
      "compare Cognigy vs Kore.ai platforms",
    );
  });

  it("restores a single-word competitor name", () => {
    expect(restoreProperNouns("best alternatives to polyai for enterprise", ["PolyAI"])).toBe(
      "best alternatives to PolyAI for enterprise",
    );
  });

  it("restores 24/7 from adjacent word tokens even with no proper nouns given", () => {
    expect(restoreProperNouns("top ai voice services for 24 7 operations support", [])).toBe(
      "top ai voice services for 24/7 operations support",
    );
  });

  it("leaves the string untouched when a competitor name does not appear", () => {
    const input = "best alternatives to cognigy for enterprise workflows";
    expect(restoreProperNouns(input, ["PolyAI"])).toBe(input);
  });

  it("produces a shape-valid prompt after restoration", () => {
    const restored = restoreProperNouns("compare cognigy vs kore ai platforms for enterprise", [
      "Cognigy",
      "Kore.ai",
    ]);
    expect(checkPromptShape(restored)).toBeNull();
  });
});
