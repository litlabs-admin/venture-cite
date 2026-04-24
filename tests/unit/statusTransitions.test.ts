import { describe, it, expect } from "vitest";
import { assertTransition, InvalidStateTransitionError } from "../../server/lib/statusTransitions";

describe("assertTransition", () => {
  describe("agent_task", () => {
    it("allows queued → in_progress", () => {
      expect(() => assertTransition("agent_task", "queued", "in_progress")).not.toThrow();
    });

    it("allows in_progress → completed", () => {
      expect(() => assertTransition("agent_task", "in_progress", "completed")).not.toThrow();
    });

    it("allows in_progress → failed", () => {
      expect(() => assertTransition("agent_task", "in_progress", "failed")).not.toThrow();
    });

    it("rejects completed → queued", () => {
      expect(() => assertTransition("agent_task", "completed", "queued")).toThrow(
        InvalidStateTransitionError,
      );
    });

    it("rejects in_progress → queued (no re-queue)", () => {
      expect(() => assertTransition("agent_task", "in_progress", "queued")).toThrow();
    });

    it("is idempotent for same-state writes", () => {
      expect(() => assertTransition("agent_task", "completed", "completed")).not.toThrow();
    });
  });

  describe("hallucination_remediation", () => {
    it("allows pending → in_progress", () => {
      expect(() =>
        assertTransition("hallucination_remediation", "pending", "in_progress"),
      ).not.toThrow();
    });

    it("allows in_progress → resolved", () => {
      expect(() =>
        assertTransition("hallucination_remediation", "in_progress", "resolved"),
      ).not.toThrow();
    });

    it("allows pending → resolved (direct one-click resolve)", () => {
      expect(() =>
        assertTransition("hallucination_remediation", "pending", "resolved"),
      ).not.toThrow();
    });

    it("allows resolved → verified (re-verification)", () => {
      expect(() =>
        assertTransition("hallucination_remediation", "resolved", "verified"),
      ).not.toThrow();
    });

    it("rejects dismissed → anything (terminal)", () => {
      expect(() =>
        assertTransition("hallucination_remediation", "dismissed", "in_progress"),
      ).toThrow();
    });

    it("rejects resolved → pending", () => {
      expect(() => assertTransition("hallucination_remediation", "resolved", "pending")).toThrow();
    });
  });

  it("carries the 409 status on InvalidStateTransitionError", () => {
    try {
      assertTransition("agent_task", "completed", "queued");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidStateTransitionError);
      expect((err as InvalidStateTransitionError).status).toBe(409);
    }
  });
});
