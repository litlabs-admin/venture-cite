// Coverage for the chatbot budget helper (Phase 5 - A1).
//
// 2026-05-27: `CHATBOT_DAILY_TOKEN_CAP` is now `-1` for every tier so the
// production runtime early-returns from `assertChatbotBudget` before any
// DB read. The throw-path tests below temporarily override the caps to
// positive values so they still verify the underlying budget LOGIC is
// correct - if caps are ever re-enabled, regressions in the cap math
// stay caught.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  dbExecute: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: { execute: stubs.dbExecute },
  pool: {},
}));

const { tokensUsedToday, assertChatbotBudget } = await import("../../server/lib/chatbotBudget");
const { BudgetExceededError, CHATBOT_DAILY_TOKEN_CAP, CHATBOT_MESSAGES_PER_HOUR } =
  await import("../../server/lib/llmPricing");

beforeEach(() => {
  stubs.dbExecute.mockReset();
});

describe("chatbotBudget", () => {
  it("tokensUsedToday returns 0 when no row exists", async () => {
    stubs.dbExecute.mockResolvedValueOnce({ rows: [] });
    const out = await tokensUsedToday("user-1");
    expect(out).toBe(0);
  });

  it("assertChatbotBudget early-returns when cap is -1 (disabled)", async () => {
    // Production state: caps disabled across all tiers. The helper should
    // not touch the DB and should not throw.
    await expect(assertChatbotBudget("user-1", "free")).resolves.toBeUndefined();
    expect(stubs.dbExecute).not.toHaveBeenCalled();
  });

  describe("with caps temporarily enabled", () => {
    // Restore values captured at module load so each test can mutate
    // freely without leaking state into the next file.
    const originalTokenCap = CHATBOT_DAILY_TOKEN_CAP.free;
    const originalMsgCap = CHATBOT_MESSAGES_PER_HOUR.free;

    beforeEach(() => {
      (CHATBOT_DAILY_TOKEN_CAP as Record<string, number>).free = 15_000;
      (CHATBOT_MESSAGES_PER_HOUR as Record<string, number>).free = 20;
    });

    afterEach(() => {
      (CHATBOT_DAILY_TOKEN_CAP as Record<string, number>).free = originalTokenCap;
      (CHATBOT_MESSAGES_PER_HOUR as Record<string, number>).free = originalMsgCap;
    });

    it("throws BudgetExceededError when tokens >= daily cap", async () => {
      const cap = CHATBOT_DAILY_TOKEN_CAP.free;
      // First call: tokensUsedToday → at cap.
      // Second call: messagesLastHour → 0.
      stubs.dbExecute
        .mockResolvedValueOnce({ rows: [{ total: cap }] })
        .mockResolvedValueOnce({ rows: [{ n: 0 }] });
      await expect(assertChatbotBudget("user-1", "free")).rejects.toBeInstanceOf(
        BudgetExceededError,
      );
    });

    it("throws BudgetExceededError when message count >= hourly cap", async () => {
      const msgCap = CHATBOT_MESSAGES_PER_HOUR.free;
      stubs.dbExecute
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ n: msgCap }] });
      await expect(assertChatbotBudget("user-1", "free")).rejects.toBeInstanceOf(
        BudgetExceededError,
      );
    });
  });
});
