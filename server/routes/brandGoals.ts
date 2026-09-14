// POST /api/brands/:brandId/goals - the write board 33 needs to let a user
// choose their first work goal.
//
// `brand_goals` (migration 0131) already exists and `WorkService.getToday`
// already reads it (`selectActiveBrandGoal`, one active row per brand), but
// nothing writes to it - the goal is null for every brand today. This file
// is the write side.
//
// The board offers a fixed catalog of four goals (mirrored on the client in
// `client/src/v2/screens/b33-baseline-review/goalCatalog.ts`) rather than
// free text, so the request only ever names a `goalKey`; the row's `title`,
// `statement` and `desiredOutcome` are filled in here, server-side, with the
// caller's own brand name - never a fixture brand name baked into the copy.

import type { Express } from "express";
import { z } from "zod";
import { eq, and, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { brandGoals } from "@shared/schema";
import { isAuthenticated } from "../auth";
import { requireBrand, requireUser } from "../lib/ownership";
import { asyncHandler, sendError } from "../lib/routesShared";

export const GOAL_CATALOG = {
  accurate_visibility: {
    title: "Improve accurate visibility",
    statement: (brand: string) => `Help more buyers see and understand ${brand} correctly.`,
    desiredOutcome: (brand: string) =>
      `Buyers researching ${brand} find correct, current information about it wherever they ask.`,
  },
  earn_citations: {
    title: "Earn more citations",
    statement: (brand: string) =>
      `Increase the number of AI answers that cite ${brand}'s own content.`,
    desiredOutcome: (brand: string) =>
      `More answers about ${brand} link back to a page it publishes.`,
  },
  increase_inquiries: {
    title: "Increase qualified inquiries",
    statement: (brand: string) => `Drive more high-intent buyer interest toward ${brand}.`,
    desiredOutcome: (brand: string) =>
      `Buyers who ask AI engines about this space are pointed toward ${brand}.`,
  },
  correct_descriptions: {
    title: "Correct wrong descriptions",
    statement: (brand: string) => `Fix inaccurate or misleading information about ${brand}.`,
    desiredOutcome: (brand: string) =>
      `AI answers about ${brand} stop repeating a fact that is no longer true.`,
  },
} as const;

export type GoalKey = keyof typeof GOAL_CATALOG;
const GOAL_KEYS = Object.keys(GOAL_CATALOG) as [GoalKey, ...GoalKey[]];

const setGoalSchema = z.object({ goalKey: z.enum(GOAL_KEYS) }).strict();

export function setupBrandGoalsRoutes(app: Express): void {
  app.post(
    "/api/brands/:brandId/goals",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const parsed = setGoalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, error: "invalid_request", details: parsed.error.issues });
      }

      const user = requireUser(req);
      let brand: { id: string; name: string };
      try {
        brand = await requireBrand(req.params.brandId, user.id);
      } catch (error) {
        sendError(res, error, "Brand not found");
        return;
      }

      const goalKey = parsed.data.goalKey;
      const catalogEntry = GOAL_CATALOG[goalKey];
      const title = catalogEntry.title;
      const statement = catalogEntry.statement(brand.name);
      const desiredOutcome = catalogEntry.desiredOutcome(brand.name);

      try {
        const goal = await db.transaction(async (tx) => {
          // Only one goal is active per brand. Archiving every OTHER active
          // row first (rather than assuming there is at most one) keeps this
          // correct even if an earlier bug ever left more than one active.
          await tx
            .update(brandGoals)
            .set({ status: "archived", updatedAt: new Date() })
            .where(
              and(
                eq(brandGoals.brandId, brand.id),
                eq(brandGoals.status, "active"),
                ne(brandGoals.goalKey, goalKey),
              ),
            );

          // `(brand_id, goal_key)` is unique regardless of status, so
          // re-selecting a goal the brand has chosen before must update that
          // row rather than insert a duplicate - this upsert does both in
          // one statement and stays correct however many times it is called.
          const [row] = await tx
            .insert(brandGoals)
            .values({
              brandId: brand.id,
              userId: user.id,
              goalKey,
              title,
              statement,
              desiredOutcome,
              ownerId: user.id,
              status: "active",
            })
            .onConflictDoUpdate({
              target: [brandGoals.brandId, brandGoals.goalKey],
              set: {
                title,
                statement,
                desiredOutcome,
                ownerId: user.id,
                status: "active",
                revision: sql`${brandGoals.revision} + 1`,
                updatedAt: new Date(),
              },
            })
            .returning({
              id: brandGoals.id,
              goalKey: brandGoals.goalKey,
              title: brandGoals.title,
              statement: brandGoals.statement,
              desiredOutcome: brandGoals.desiredOutcome,
            });
          return row;
        });

        return res.json({ success: true, data: goal });
      } catch (error) {
        return sendError(res, error, "Unable to save the goal");
      }
    }),
  );
}
