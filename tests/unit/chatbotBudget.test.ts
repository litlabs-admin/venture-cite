// Coverage for the chatbot budget helper (Phase 5 — A1).
//
// Verifies the read helper returns 0 for an empty row, and that the
// budget assertion throws BudgetExceededError on either axis (daily
// token cap or hourly message cap). The db.execute helper is mocked
// so no database is touched.

import { describe, it, expect, beforeEach, vi } from "vitest";

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

  it("assertChatbotBudget throws BudgetExceededError when tokens >= daily cap", async () => {
    const cap = CHATBOT_DAILY_TOKEN_CAP.free;
    // First call: tokensUsedToday → at cap.
    // Second call: messagesLastHour → 0.
    stubs.dbExecute
      .mockResolvedValueOnce({ rows: [{ total: cap }] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] });
    await expect(assertChatbotBudget("user-1", "free")).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("assertChatbotBudget throws BudgetExceededError when message count >= hourly cap", async () => {
    const msgCap = CHATBOT_MESSAGES_PER_HOUR.free;
    stubs.dbExecute
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [{ n: msgCap }] });
    await expect(assertChatbotBudget("user-1", "free")).rejects.toBeInstanceOf(BudgetExceededError);
  });
});
