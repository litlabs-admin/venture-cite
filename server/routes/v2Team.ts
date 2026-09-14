// Endpoints for /v2/settings/team.
//
// This app has no multi-user membership table: a brand's only real member is
// its owner (brands.user_id). What this file adds is real, but scoped to
// what actually exists - pending seat invitations (v2_team_invitations,
// migration 0184), and a task-handoff record. Both are honest about the
// absence of a second real user: an invitation grants nothing by itself, and
// a "handoff" is an audited annotation, never a fake ownership transfer
// (work_tasks.owner_id stays the brand owner - there is no one else to move
// it to).

import type { Express } from "express";
import { and, desc, eq, like } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  auditLogs,
  v2TeamInvitationRoles,
  v2TeamInvitations,
  workTasks,
  type V2TeamInvitationRole,
} from "@shared/schema";
import { requireBrand, requireUser } from "../lib/ownership";
import { asyncHandler, sendError } from "../lib/routesShared";
import { logAudit } from "../lib/audit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isInvitationRole(value: unknown): value is V2TeamInvitationRole {
  return typeof value === "string" && (v2TeamInvitationRoles as readonly string[]).includes(value);
}

function displayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || "Account owner";
}

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  afterJsonb: unknown;
  createdAt: Date;
};

function summarizeAudit(row: AuditRow): string {
  const after = (row.afterJsonb ?? null) as Record<string, unknown> | null;
  switch (row.action) {
    case "team.invitation_created": {
      const email = typeof after?.email === "string" ? after.email : null;
      const role = typeof after?.role === "string" ? after.role : "a teammate";
      return email ? `Invited ${email} as ${role}` : "Invited a teammate";
    }
    case "team.invitation_revoked": {
      const email = typeof after?.email === "string" ? after.email : null;
      return email ? `Revoked the invitation for ${email}` : "Revoked an invitation";
    }
    case "team.invitation_resent": {
      const email = typeof after?.email === "string" ? after.email : null;
      return email ? `Resent the invitation to ${email}` : "Resent an invitation";
    }
    case "team.task_handoff_recorded": {
      const title = typeof after?.taskTitle === "string" ? after.taskTitle : null;
      const toEmail = typeof after?.toEmail === "string" ? after.toEmail : null;
      if (!title) return "Recorded a task handoff";
      return toEmail
        ? `Recorded a handoff for "${title}" to ${toEmail}`
        : `Recorded a handoff for "${title}"`;
    }
    default:
      return row.action;
  }
}

export function setupV2TeamRoutes(app: Express): void {
  // GET /api/v2/team/:brandId/overview
  // Everything the Team settings screen renders in one read: the real owner,
  // the real brand count, pending invitations, and recent team-scoped audit
  // events.
  app.get(
    "/api/v2/team/:brandId/overview",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);

        const [owner, brands, invitationRows, auditRows] = await Promise.all([
          storage.getUser(user.id),
          storage.getBrandsByUserId(user.id),
          db
            .select()
            .from(v2TeamInvitations)
            .where(eq(v2TeamInvitations.ownerUserId, user.id))
            .orderBy(desc(v2TeamInvitations.createdAt)),
          db
            .select({
              id: auditLogs.id,
              action: auditLogs.action,
              entityType: auditLogs.entityType,
              entityId: auditLogs.entityId,
              afterJsonb: auditLogs.afterJsonb,
              createdAt: auditLogs.createdAt,
            })
            .from(auditLogs)
            .where(and(eq(auditLogs.userId, user.id), like(auditLogs.action, "team.%")))
            .orderBy(desc(auditLogs.createdAt))
            .limit(10),
        ]);

        if (!owner) {
          return res.status(404).json({ success: false, error: "User not found" });
        }

        const acceptedCount = invitationRows.filter((row) => row.status === "accepted").length;

        res.json({
          success: true,
          data: {
            owner: { id: owner.id, name: displayName(owner), email: owner.email },
            assignedBrandCount: brands.length,
            seatsUsed: 1 + acceptedCount,
            invitations: invitationRows.map((row) => ({
              id: row.id,
              email: row.email,
              role: row.role,
              status: row.status,
              createdAt: row.createdAt.toISOString(),
            })),
            auditEvents: auditRows.map((row) => ({
              id: row.id,
              action: row.action,
              entityType: row.entityType,
              entityId: row.entityId,
              occurredAt: row.createdAt.toISOString(),
              summary: summarizeAudit(row),
            })),
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to load team overview");
      }
    }),
  );

  // POST /api/v2/team/:brandId/invitations  { email, role }
  app.post(
    "/api/v2/team/:brandId/invitations",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);

        const email =
          typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
        const role = req.body?.role;
        if (!EMAIL_RE.test(email)) {
          return res.status(400).json({ success: false, error: "Enter a valid email address." });
        }
        if (!isInvitationRole(role)) {
          return res
            .status(400)
            .json({ success: false, error: "Choose a role for this invitation." });
        }

        let created;
        try {
          [created] = await db
            .insert(v2TeamInvitations)
            .values({ ownerUserId: user.id, email, role, status: "pending" })
            .returning();
        } catch (err) {
          if (err instanceof Error && /unique/i.test(err.message)) {
            return res.status(409).json({
              success: false,
              error: "An invitation to this address is already pending.",
            });
          }
          throw err;
        }

        await logAudit(req, {
          action: "team.invitation_created",
          entityType: "v2_team_invitation",
          entityId: created.id,
          after: { email: created.email, role: created.role },
        });

        res.json({
          success: true,
          data: {
            id: created.id,
            email: created.email,
            role: created.role,
            status: created.status,
            createdAt: created.createdAt.toISOString(),
          },
        });
      } catch (error) {
        sendError(res, error, "Failed to create invitation");
      }
    }),
  );

  // POST /api/v2/team/:brandId/invitations/:invitationId/revoke
  app.post(
    "/api/v2/team/:brandId/invitations/:invitationId/revoke",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);

        const [updated] = await db
          .update(v2TeamInvitations)
          .set({ status: "revoked" })
          .where(
            and(
              eq(v2TeamInvitations.id, req.params.invitationId),
              eq(v2TeamInvitations.ownerUserId, user.id),
            ),
          )
          .returning();
        if (!updated) {
          return res.status(404).json({ success: false, error: "Invitation not found" });
        }

        await logAudit(req, {
          action: "team.invitation_revoked",
          entityType: "v2_team_invitation",
          entityId: updated.id,
          after: { email: updated.email },
        });

        res.json({ success: true, data: { id: updated.id } });
      } catch (error) {
        sendError(res, error, "Failed to revoke invitation");
      }
    }),
  );

  // POST /api/v2/team/:brandId/invitations/:invitationId/resend
  // No outbound email infrastructure is wired here - this is a real,
  // idempotent action (it bumps the invitation's timestamp and writes an
  // audit event), not a simulated send.
  app.post(
    "/api/v2/team/:brandId/invitations/:invitationId/resend",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        await requireBrand(req.params.brandId, user.id);

        const [updated] = await db
          .update(v2TeamInvitations)
          .set({ createdAt: new Date() })
          .where(
            and(
              eq(v2TeamInvitations.id, req.params.invitationId),
              eq(v2TeamInvitations.ownerUserId, user.id),
              eq(v2TeamInvitations.status, "pending"),
            ),
          )
          .returning();
        if (!updated) {
          return res
            .status(404)
            .json({ success: false, error: "No pending invitation to resend." });
        }

        await logAudit(req, {
          action: "team.invitation_resent",
          entityType: "v2_team_invitation",
          entityId: updated.id,
          after: { email: updated.email },
        });

        res.json({
          success: true,
          data: { id: updated.id, createdAt: updated.createdAt.toISOString() },
        });
      } catch (error) {
        sendError(res, error, "Failed to resend invitation");
      }
    }),
  );

  // POST /api/v2/team/:brandId/handoff  { taskId, toEmail?, note, dueDate? }
  app.post(
    "/api/v2/team/:brandId/handoff",
    asyncHandler(async (req, res) => {
      try {
        const user = requireUser(req);
        const brand = await requireBrand(req.params.brandId, user.id);

        const taskId = typeof req.body?.taskId === "string" ? req.body.taskId : "";
        const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : "";
        const toEmail =
          typeof req.body?.toEmail === "string" && req.body.toEmail ? req.body.toEmail : null;
        const dueDate = typeof req.body?.dueDate === "string" ? req.body.dueDate : null;
        if (!taskId) {
          return res.status(400).json({ success: false, error: "Choose a task to hand off." });
        }

        const [task] = await db
          .select({ id: workTasks.id, title: workTasks.title, brandId: workTasks.brandId })
          .from(workTasks)
          .where(and(eq(workTasks.id, taskId), eq(workTasks.brandId, brand.id)))
          .limit(1);
        if (!task) {
          return res.status(404).json({ success: false, error: "Task not found" });
        }

        await logAudit(req, {
          action: "team.task_handoff_recorded",
          entityType: "work_task",
          entityId: task.id,
          after: { taskTitle: task.title, toEmail, note, dueDate },
        });

        res.json({ success: true, data: { id: task.id } });
      } catch (error) {
        sendError(res, error, "Failed to record the handoff");
      }
    }),
  );
}
