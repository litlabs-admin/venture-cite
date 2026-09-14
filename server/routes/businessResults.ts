import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { businessResultEvents } from "@shared/schema";
import { isAuthenticated } from "../auth";
import { requireBrand, requireUser } from "../lib/ownership";
import { asyncHandler, sendError } from "../lib/routesShared";
import { createRequestActor } from "../lib/requestActor";
import { setRestrictedRequestContext } from "../data/restrictedRequestTransaction";

// Manual business-result entry.
//
// `business_result_events` (migration 0131) had no writer anywhere in the
// server before this file: outcome review (board 21) asked a user to report
// qualified inquiries, demo requests and referral URLs, and the "Save" button
// only flipped local React state. This is the honest source those fields
// write to.
//
// EVENT-KIND MAPPING. The table's check constraint allows exactly four kinds
// - referral_visit, inquiry, qualified_lead, retained_customer - and there is
// no fifth for "demo request". The client maps a manual demo-request count to
// "inquiry" (a demo request is a request, unconfirmed until reviewed) and a
// qualified-inquiry count to "qualified_lead" (the reviewer has already
// judged it qualified). Both are asserted by the schema, not invented here.
//
// Every event this endpoint writes is `confirmation_state = "confirmed"`
// and `attribution_method = "manual"`: a person typed the number in, so
// nothing here is inferred or estimated.
const BUSINESS_RESULT_KINDS = [
  "referral_visit",
  "inquiry",
  "qualified_lead",
  "retained_customer",
] as const;

const eventSchema = z
  .object({
    eventKind: z.enum(BUSINESS_RESULT_KINDS),
    value: z.number().finite().nullable().optional(),
    valueUnit: z.string().trim().min(1).max(40).nullable().optional(),
    occurredAt: z.string().datetime(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const requestSchema = z
  .object({
    events: z.array(eventSchema).min(1).max(10),
  })
  .strict();

export function setupBusinessResultsRoutes(app: Express): void {
  app.post(
    "/api/brands/:brandId/business-results",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const parsed = requestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, error: "invalid_request", details: parsed.error.issues });
      }

      const user = requireUser(req);
      try {
        const brand = await requireBrand(req.params.brandId, user.id);
        const actor = createRequestActor(user.id);
        const inserted = await db.transaction(async (transaction) => {
          await setRestrictedRequestContext({ actor, role: "venturecite_request", transaction });
          return transaction
            .insert(businessResultEvents)
            .values(
              parsed.data.events.map((event) => ({
                brandId: brand.id,
                userId: user.id,
                eventKey: randomUUID(),
                eventKind: event.eventKind,
                value: event.value == null ? null : String(event.value),
                valueUnit: event.valueUnit ?? null,
                source: "manual_entry",
                attributionMethod: "manual",
                confirmationState: "confirmed" as const,
                confirmedBy: user.id,
                occurredAt: new Date(event.occurredAt),
                notes: event.notes ?? null,
              })),
            )
            .returning({
              id: businessResultEvents.id,
              eventKind: businessResultEvents.eventKind,
              value: businessResultEvents.value,
              valueUnit: businessResultEvents.valueUnit,
              occurredAt: businessResultEvents.occurredAt,
              notes: businessResultEvents.notes,
            });
        });

        return res.json({
          success: true,
          data: {
            items: inserted.map((row) => ({
              id: row.id,
              eventKind: row.eventKind,
              value: row.value === null ? null : Number(row.value),
              valueUnit: row.valueUnit,
              occurredAt: row.occurredAt.toISOString(),
              notes: row.notes,
            })),
          },
        });
      } catch (error) {
        return sendError(res, error, "Unable to record business results");
      }
    }),
  );
}
