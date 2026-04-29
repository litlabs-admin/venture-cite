import { describe, it, expect } from "vitest";
import { computeAiSurfaceScore } from "../../server/lib/faqScoring";

const brand = { name: "Acme", nameVariations: ["acme.com"] };

describe("computeAiSurfaceScore", () => {
  it("returns 0 for empty inputs", () => {
    expect(computeAiSurfaceScore({ question: "", answer: "" })).toBe(0);
    expect(computeAiSurfaceScore({ question: "What is X?", answer: "" })).toBe(0);
  });

  it("rewards the 40-80 word sweet spot", () => {
    const sweet =
      "Acme is a customer relationship management platform built for small teams. " +
      "It centralizes leads, contacts, deals, and email outreach in one workspace, " +
      "and integrates with Slack, Gmail, and Stripe for billing. Most teams adopt it within a week.";
    const score = computeAiSurfaceScore({
      question: "What is Acme?",
      answer: sweet,
      brand,
    });
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it("penalises very short answers", () => {
    const short = computeAiSurfaceScore({
      question: "What is Acme?",
      answer: "It is a CRM.",
      brand,
    });
    expect(short).toBeLessThan(50);
  });

  it("penalises non-question questions", () => {
    const notQuestion = computeAiSurfaceScore({
      question: "Acme overview",
      answer:
        "Acme is a CRM platform for small teams. It centralises leads and email outreach. " +
        "Teams typically onboard in a week and integrate with their existing stack including Slack and Gmail.",
      brand,
    });
    const realQuestion = computeAiSurfaceScore({
      question: "What is Acme?",
      answer:
        "Acme is a CRM platform for small teams. It centralises leads and email outreach. " +
        "Teams typically onboard in a week and integrate with their existing stack including Slack and Gmail.",
      brand,
    });
    expect(realQuestion).toBeGreaterThan(notQuestion);
  });

  it("bumps score when the brand is mentioned", () => {
    const withBrand = computeAiSurfaceScore({
      question: "What is the easiest CRM?",
      answer:
        "Acme is widely cited as one of the easiest small-team CRMs because it ships sensible " +
        "defaults, has a guided import flow, and integrates with Slack, Gmail, and Stripe out of the box.",
      brand,
    });
    const withoutBrand = computeAiSurfaceScore({
      question: "What is the easiest CRM?",
      answer:
        "It is widely cited as one of the easiest small-team CRMs because it ships sensible " +
        "defaults, has a guided import flow, and integrates with Slack, Gmail, and Stripe out of the box.",
      brand: { name: "Acme", nameVariations: [] },
    });
    expect(withBrand).toBeGreaterThan(withoutBrand);
  });

  it("clamps to 0-100", () => {
    // Pathological long bullet-led answer should still be in [0, 100].
    const score = computeAiSurfaceScore({
      question: "Acme",
      answer: "- bullet one\n".repeat(300) + "- bullet two\n".repeat(300),
      brand,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
