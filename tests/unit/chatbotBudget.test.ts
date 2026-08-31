// Coverage for the chatbot budget helper (Phase 5 - A1).
//
// 2026-08-31: `CHATBOT_DAILY_TOKEN_CAP` carries real per-tier limits again
// (see server/lib/llmPricing.ts for the cost arithmetic). `-1` is still
// supported as an explicit "unlimited" escape hatch - assertChatbotBudget
// early-returns before any DB read when a tier's cap is `-1`, which the
// first test below still covers by overriding the free-tier cap.

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
    // -1 is still a supported "unlimited" override for a tier. When set,
    // the helper must not touch the DB and must not throw.
    const originalCap = CHATBOT_DAILY_TOKEN_CAP.free;
    (CHATBOT_DAILY_TOKEN_CAP as Record<string, number>).free = -1;
    try {
      await expect(assertChatbotBudget("user-1", "free")).resolves.toBeUndefined();
      expect(stubs.dbExecute).not.toHaveBeenCalled();
    } finally {
      (CHATBOT_DAILY_TOKEN_CAP as Record<string, number>).free = originalCap;
    }
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
