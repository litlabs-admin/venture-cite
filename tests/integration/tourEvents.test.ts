// tests/integration/tourEvents.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "../../server/db";
import { users, tourEvents } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../../server/storage";

const TEST_USER_ID = "00000000-0000-0000-0000-00000000bbbb";
const EVENT_ID_1 = "11111111-1111-1111-1111-111111111111";

async function seedUser() {
  await db.delete(tourEvents).where(eq(tourEvents.userId, TEST_USER_ID));
  await db.delete(users).where(eq(users.id, TEST_USER_ID));
  await db.insert(users).values({
    id: TEST_USER_ID,
    email: "events-test@example.com",
    onboardingState: {},
  } as never);
}

describe("tour events storage (integration)", () => {
  beforeEach(seedUser);

  afterAll(async () => {
    await db.delete(tourEvents).where(eq(tourEvents.userId, TEST_USER_ID));
    await db.delete(users).where(eq(users.id, TEST_USER_ID));
  });

  it("recordTourEvents persists batch", async () => {
    await storage.recordTourEvents([
      {
        id: EVENT_ID_1,
        userId: TEST_USER_ID,
        brandId: null,
        tourId: "global-welcome",
        tourVersion: 1,
        stepId: "intro",
        stepIndex: 0,
        eventType: "tour_step_viewed",
        triggerType: "auto",
        dwellMs: null,
        occurredAt: new Date("2026-05-05T12:00:00.000Z"),
      },
    ]);
    const rows = await db.select().from(tourEvents).where(eq(tourEvents.id, EVENT_ID_1));
    expect(rows).toHaveLength(1);
    expect(rows[0].tourId).toBe("global-welcome");
  });

  it("duplicate id is upsert no-op (idempotency)", async () => {
    const event = {
      id: EVENT_ID_1,
      userId: TEST_USER_ID,
      brandId: null,
      tourId: "global-welcome" as const,
      tourVersion: 1,
      stepId: "intro",
      stepIndex: 0,
      eventType: "tour_step_viewed" as const,
      triggerType: "auto" as const,
      dwellMs: null,
      occurredAt: new Date("2026-05-05T12:00:00.000Z"),
    };
    await storage.recordTourEvents([event]);
    await storage.recordTourEvents([event]);
    const rows = await db.select().from(tourEvents).where(eq(tourEvents.id, EVENT_ID_1));
    expect(rows).toHaveLength(1);
  });
});
