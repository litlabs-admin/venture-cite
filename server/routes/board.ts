// Internal board storage. Administrators can read and replace the shared board.

import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { systemState } from "@shared/schema";
import { asyncHandler } from "../lib/routesShared";
import { logger } from "../lib/logger";
import { isAdmin } from "../auth";

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
  app.get(
    "/api/board",
    isAdmin,
    asyncHandler(async (_req, res) => {
      const [row] = await db.select().from(systemState).where(eq(systemState.key, KEY)).limit(1);
      res.json({
        tickets: row ? (row.valueJson as Ticket[]) : null,
        updatedAt: row?.updatedAt ?? null,
      });
    }),
  );

  app.put(
    "/api/board",
    isAdmin,
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
