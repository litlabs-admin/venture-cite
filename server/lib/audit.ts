import type { Request } from "express";
import { db } from "../db";
import { auditLogs } from "@shared/schema";
import { logger } from "./logger";
import { Sentry } from "../instrument";

// Sensitive-operation audit log.
//
// Two ergonomic shapes:
//   - logAudit(req, params)         — fire-and-forget after the op
//   - withAudit(req, params, fn)    — wraps an async op; only logs on success
//
// Failure mode: audit logging NEVER throws to the caller. A failure to
// write the audit row is logged + reported to Sentry but does not roll
// back the underlying operation. Audit logs are belt-and-braces; the
// underlying op succeeding is what the user cares about.

export interface AuditParams {
  /** Dotted action key, e.g. "brand.delete", "user.delete", "subscription.update" */
  action: string;
  /** Entity type for indexing/grouping, e.g. "brand", "user", "subscription" */
  entityType: string;
  /** Primary key of the affected row (string for varchar PKs, stringified for numeric) */
  entityId?: string | null;
  /** Snapshot of the row before the change. Skip for pure-create ops. */
  before?: unknown;
  /** Snapshot after. Skip (or null) for delete ops. */
  after?: unknown;
  /** Override the user id (e.g. when an admin acts on behalf of a user). Defaults to req.user.id. */
  userIdOverride?: string;
}

function extractUserId(req: Request): string | null {
  const user = (req as unknown as { user?: { id?: string } }).user;
  return user?.id ?? null;
}

function extractIp(req: Request): string | null {
  // Express's req.ip already honors X-Forwarded-For when trust proxy is set
  // (see server/index.ts:27).
  return req.ip ?? null;
}

function extractUserAgent(req: Request): string | null {
  const ua = req.headers["user-agent"];
  if (!ua) return null;
  // Cap to keep audit rows from blowing up if a client sends a 4KB UA.
  return String(ua).slice(0, 512);
}

export async function logAudit(req: Request, params: AuditParams): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: params.userIdOverride ?? extractUserId(req),
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      beforeJsonb: params.before === undefined ? null : (params.before as Record<string, unknown>),
      afterJsonb: params.after === undefined ? null : (params.after as Record<string, unknown>),
      ip: extractIp(req),
      userAgent: extractUserAgent(req),
    });
  } catch (err) {
    // Don't throw — audit failure shouldn't fail the underlying request.
    logger.error({ err, action: params.action }, "audit: failed to write log row");
    Sentry.captureException(err, { tags: { source: "audit-log" } });
  }
}

export async function withAudit<T>(
  req: Request,
  params: AuditParams,
  fn: () => Promise<T>,
): Promise<T> {
  const result = await fn();
  await logAudit(req, params);
  return result;
}

// System-initiated audit (webhook handlers, cron jobs). No req → no
// IP / user-agent. userId is required (the affected user), action /
// entity fields exactly as in logAudit.
export async function logSystemAudit(userId: string | null, params: AuditParams): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      beforeJsonb: params.before === undefined ? null : (params.before as Record<string, unknown>),
      afterJsonb: params.after === undefined ? null : (params.after as Record<string, unknown>),
      ip: null,
      userAgent: null,
    });
  } catch (err) {
    logger.error({ err, action: params.action }, "audit: failed to write system log row");
    Sentry.captureException(err, { tags: { source: "audit-log-system" } });
  }
}
