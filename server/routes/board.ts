// Public work board storage.
//
// The board at /internal-page is public and has no sign-in. It used to keep its
// state in the visitor's own localStorage, so a change was permanent for that
// one browser only, and a different browser saw the seed again. The board is a
// shared roadmap, so the state belongs on the server.
//
// STORAGE: one row in `system_state`, a generic key and JSONB table that
// already exists. No migration is needed.
//
// SECURITY: the write route is open, exactly like the page. Anyone who reaches
// the URL can replace the board. The payload is size-capped and shape-checked,
// so it cannot be used to store arbitrary bulk data. Put the write behind
// `isAuthenticated` if the board must become read-only for the public.

import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { systemState } from "@shared/schema";
import { asyncHandler } from "../lib/routesShared";
import { logger } from "../lib/logger";

const KEY = "internal-board";
const MAX_TICKETS = 500;
const MAX_FIELD = 4000;

const COLUMNS = new Set(["backlog", "next", "doing", "blocked", "done"]);
const KINDS = new Set(["feature", "upgrade"]);

interface Ticket {
  id: string;
  title: string;
  detail: string;
  kind: string;
  weight: string;
  area: string;
  evidence: string;
  column: string;
  order: number;
}

/** Keep only well-formed tickets. A bad row is dropped, never stored. */
function clean(input: unknown): Ticket[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length > MAX_TICKETS) return null;

  const out: Ticket[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) continue;
    const t = raw as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v.slice(0, MAX_FIELD) : "");
    const id = str(t.id);
    const title = str(t.title);
    if (!id || !title) continue;
    out.push({
      id,
      title,
      detail: str(t.detail),
      kind: KINDS.has(String(t.kind)) ? String(t.kind) : "feature",
      weight: ["high", "medium", "low"].includes(String(t.weight)) ? String(t.weight) : "medium",
      area: str(t.area),
      evidence: str(t.evidence),
      column: COLUMNS.has(String(t.column)) ? String(t.column) : "backlog",
      order: Number.isFinite(Number(t.order)) ? Number(t.order) : 0,
    });
  }
  return out;
}

export function setupBoardRoutes(app: Express) {
  // Read the board. Returns null when nobody has saved one yet, so the client
  // knows to show its seed instead of an empty board.
  app.get(
    "/api/board",
    asyncHandler(async (_req, res) => {
      const [row] = await db.select().from(systemState).where(eq(systemState.key, KEY)).limit(1);
      res.json({
        tickets: row ? (row.valueJson as Ticket[]) : null,
        updatedAt: row?.updatedAt ?? null,
      });
    }),
  );

  // Replace the board. The whole list is sent every time, because a drag can
  // change several rows at once and a partial update would race.
  app.put(
    "/api/board",
    asyncHandler(async (req, res) => {
      const tickets = clean((req.body as { tickets?: unknown } | undefined)?.tickets);
      if (!tickets) {
        res.status(400).json({ error: "tickets must be an array of at most 500 items" });
        return;
      }

      await db
        .insert(systemState)
        .values({ key: KEY, valueJson: tickets, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemState.key,
          set: { valueJson: tickets, updatedAt: new Date() },
        });

      logger.info({ count: tickets.length }, "internal board saved");
      res.json({ saved: true, count: tickets.length });
    }),
  );
}
