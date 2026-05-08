// tests/integration/tourRetention.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "../../server/db";
import { users, tourEvents } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../../server/storage";

const TEST_USER_ID = "00000000-0000-0000-0000-00000000cccc";

async function seedUser() {
  await db.delete(tourEvents).where(eq(tourEvents.userId, TEST_USER_ID));
  await db.delete(users).where(eq(users.id, TEST_USER_ID));
  await db.insert(users).values({
    id: TEST_USER_ID,
    email: "retention-test@example.com",
    onboardingState: {},
  } as never);
}

describe("tour events retention (integration)", () => {
  beforeEach(seedUser);

  afterAll(async () => {
    await db.delete(tourEvents).where(eq(tourEvents.userId, TEST_USER_ID));
    await db.delete(users).where(eq(users.id, TEST_USER_ID));
  });

  it("deleteOldTourEvents purges rows older than cutoff, keeps newer", async () => {
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100d ago
    const fresh = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10d ago

    await storage.recordTourEvents([
      {
        id: "22222222-2222-2222-2222-222222222222",
        userId: TEST_USER_ID,
        brandId: null,
        tourId: "global-welcome",
        tourVersion: 1,
        stepId: null,
        stepIndex: null,
        eventType: "tour_completed",
        triggerType: "auto",
        dwellMs: null,
        occurredAt: old,
      },
      {
        id: "33333333-3333-3333-3333-333333333333",
        userId: TEST_USER_ID,
        brandId: null,
        tourId: "global-welcome",
        tourVersion: 1,
        stepId: null,
        stepIndex: null,
        eventType: "tour_completed",
        triggerType: "auto",
        dwellMs: null,
        occurredAt: fresh,
      },
    ]);

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    await storage.deleteOldTourEvents(cutoff);

    const remaining = await db.select().from(tourEvents).where(eq(tourEvents.userId, TEST_USER_ID));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("33333333-3333-3333-3333-333333333333");
  });
});
