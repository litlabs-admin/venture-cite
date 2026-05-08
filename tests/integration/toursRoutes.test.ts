// tests/integration/toursRoutes.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "../../server/db";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../../server/storage";

const TEST_USER_ID = "00000000-0000-0000-0000-00000000aaaa";

async function seedUser() {
  await db.delete(users).where(eq(users.id, TEST_USER_ID));
  await db.insert(users).values({
    id: TEST_USER_ID,
    email: "tours-test@example.com",
    onboardingState: {},
  } as never);
}

describe("tour state storage (integration)", () => {
  beforeEach(seedUser);

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, TEST_USER_ID));
  });

  it("getTourState returns empty object for new user", async () => {
    const tours = await storage.getTourState(TEST_USER_ID);
    expect(tours).toEqual({});
  });

  it("markCompleted on global-welcome writes state.global", async () => {
    await storage.patchTourState(TEST_USER_ID, "markCompleted", {
      tourId: "global-welcome",
      version: 1,
      brandId: null,
      timestamp: "2026-05-05T12:00:00.000Z",
    });
    const tours = await storage.getTourState(TEST_USER_ID);
    expect((tours as { global?: { v: number; completedAt: string } }).global).toEqual({
      v: 1,
      completedAt: "2026-05-05T12:00:00.000Z",
    });
  });

  it("suppress is idempotent on second call", async () => {
    await storage.patchTourState(TEST_USER_ID, "suppress", {
      tourId: "citations",
      timestamp: "2026-05-05T12:00:00.000Z",
    });
    await storage.patchTourState(TEST_USER_ID, "suppress", {
      tourId: "citations",
      timestamp: "2026-05-05T12:01:00.000Z",
    });
    const tours = await storage.getTourState(TEST_USER_ID);
    expect((tours as { perUserSuppressed?: string[] }).perUserSuppressed).toEqual(["citations"]);
  });

  it("clearBrand removes perBrand[brandId]", async () => {
    await storage.patchTourState(TEST_USER_ID, "markCompleted", {
      tourId: "citations",
      version: 1,
      brandId: "brand-test",
      timestamp: "2026-05-05T12:00:00.000Z",
    });
    await storage.clearTourStateForBrand("brand-test");
    const tours = await storage.getTourState(TEST_USER_ID);
    expect(
      (tours as { perBrand?: Record<string, unknown> }).perBrand?.["brand-test"],
    ).toBeUndefined();
  });
});
