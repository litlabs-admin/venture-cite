// tests/integration/tourRetention.test.ts
// dotenv must load BEFORE the server/db import so DATABASE_URL is set when
// the pool initializes. Global setup intentionally doesn't load dotenv -
// see tests/setup.ts.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { users, tourEvents } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { configureDestructiveDatabaseTest } from "../helpers/destructiveDatabaseTest";

const databaseTest = configureDestructiveDatabaseTest(process.env);

if (databaseTest.kind === "ready") {
  const { db } = await import("../../server/db");
  const { storage } = await import("../../server/storage");

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

      // storage.deleteOldTourEvents() retains on server_received_at (server
      // clock), NOT occurred_at (client-influenced) - see the comment on
      // deleteOldTourEvents in server/databaseStorage.ts: "retention must
      // key off a trusted column so rows can't dodge or trigger early
      // cleanup." insertTourEventSchema (shared/schema.ts) deliberately
      // omits serverReceivedAt for that same reason, so
      // storage.recordTourEvents() can't be used to backdate it - insert
      // directly against the Drizzle table instead so the test can control
      // the column the retention query actually filters on.
      await db.insert(tourEvents).values([
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
          serverReceivedAt: old,
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
          serverReceivedAt: fresh,
        },
      ] as never);

      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      await storage.deleteOldTourEvents(cutoff);

      const remaining = await db
        .select()
        .from(tourEvents)
        .where(eq(tourEvents.userId, TEST_USER_ID));
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe("33333333-3333-3333-3333-333333333333");
    });
  });
} else {
  describe.skip("tour events retention (integration)", () => {
    it("requires TEST_DATABASE_URL", () => {});
  });
}
