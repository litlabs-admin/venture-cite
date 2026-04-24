// One-click email unsubscribe endpoint (Wave 2.4).
//
// Reached from the List-Unsubscribe header in transactional emails. The
// HMAC-signed token in the URL authenticates the user, so this route is
// intentionally unauth'd — mail clients (Gmail, Outlook) fire POST
// requests here directly without any cookie or bearer token, per RFC 8058.
//
// Both GET and POST are handled:
//   - POST /api/unsubscribe?token=...  — RFC 8058 one-click button
//   - GET  /api/unsubscribe?token=...  — friendly browser landing page

import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { logger } from "../lib/logger";
import { Sentry } from "../instrument";
import { verifyUnsubscribeToken, type UnsubscribeList } from "../lib/unsubscribeToken";

// Maps a list name to the user-table column that controls subscription.
// Add new lists here as they're introduced.
const LIST_TO_COLUMN: Record<UnsubscribeList, "weeklyReportEnabled"> = {
  weekly_report: "weeklyReportEnabled",
  // marketing: "marketingEmailsEnabled",  // when that column exists
  marketing: "weeklyReportEnabled", // placeholder until a marketing column exists
};

async function applyUnsubscribe(userId: string, list: UnsubscribeList): Promise<{ ok: boolean }> {
  const column = LIST_TO_COLUMN[list];
  if (!column) return { ok: false };

  // Drizzle's typed update needs an object literal — building dynamically
  // requires a small cast, which is fine because the column key is from
  // the constant LIST_TO_COLUMN map (no user-controlled key).
  const updates = { [column]: 0 } as Record<string, unknown>;
  await db
    .update(users)
    .set(updates as { weeklyReportEnabled: number })
    .where(eq(users.id, userId));
  return { ok: true };
}

export function setupUnsubscribeRoutes(app: Express) {
  // POST = RFC 8058 one-click. Mail clients send an empty body with
  //        Content-Type: application/x-www-form-urlencoded.
  app.post("/api/unsubscribe", async (req, res) => {
    try {
      const token = String(req.query.token ?? "");
      const verified = verifyUnsubscribeToken(token);
      if (!verified) {
        return res.status(400).json({ success: false, error: "Invalid or expired link." });
      }
      const { ok } = await applyUnsubscribe(verified.userId, verified.list);
      if (!ok) {
        return res.status(400).json({ success: false, error: "Unknown list." });
      }
      logger.info({ userId: verified.userId, list: verified.list }, "unsubscribe: applied (POST)");
      return res.status(200).json({ success: true });
    } catch (err) {
      logger.error({ err }, "unsubscribe POST failed");
      Sentry.captureException(err, { tags: { source: "unsubscribe-post" } });
      return res.status(500).json({ success: false, error: "Failed to process unsubscribe." });
    }
  });

  // GET = browser landing page. Returns a small HTML confirmation so the
  // user gets visual feedback when they click the link manually.
  app.get("/api/unsubscribe", async (req, res) => {
    try {
      const token = String(req.query.token ?? "");
      const verified = verifyUnsubscribeToken(token);
      if (!verified) {
        return res
          .status(400)
          .type("html")
          .send(
            htmlPage(
              "Invalid link",
              "This unsubscribe link is invalid or has been corrupted. " +
                "If you received this in error, manage your email preferences in account settings.",
            ),
          );
      }
      await applyUnsubscribe(verified.userId, verified.list);
      logger.info({ userId: verified.userId, list: verified.list }, "unsubscribe: applied (GET)");
      return res
        .type("html")
        .send(
          htmlPage(
            "You're unsubscribed",
            `You won't receive any more <strong>${escape(verified.list.replace("_", " "))}</strong> emails. ` +
              "You can re-enable them anytime from your account settings.",
          ),
        );
    } catch (err) {
      logger.error({ err }, "unsubscribe GET failed");
      Sentry.captureException(err, { tags: { source: "unsubscribe-get" } });
      return res
        .status(500)
        .type("html")
        .send(
          htmlPage(
            "Something went wrong",
            "We couldn't process your unsubscribe right now. Please try the link again, " +
              "or update your preferences in account settings.",
          ),
        );
    }
  });
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:80px auto;padding:0 24px;color:#1a1a1a}
  h1{font-size:24px;margin:0 0 16px}
  p{font-size:16px;line-height:1.5;margin:0 0 16px}
  a{color:#7c3aed}
</style></head>
<body>
  <h1>${escape(title)}</h1>
  <p>${body}</p>
</body></html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
