// One-click email unsubscribe endpoint (Wave 2.4).
//
// Reached from the List-Unsubscribe header in transactional emails. The
// HMAC-signed token in the URL authenticates the user, so this route is
// intentionally unauth'd - mail clients (Gmail, Outlook) fire POST
// requests here directly without any cookie or bearer token, per RFC 8058.
//
// Both GET and POST are handled:
//   - POST /api/unsubscribe?token=...  - RFC 8058 one-click button
//   - GET  /api/unsubscribe?token=...  - friendly browser landing page

import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { logger } from "../lib/logger";
import { verifyUnsubscribeToken, type UnsubscribeList } from "../lib/unsubscribeToken";
import { asyncHandler } from "../lib/routesShared";

import { captureAndFlush } from "../lib/sentryReport";
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

  // Drizzle's typed update needs an object literal - building dynamically
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
  app.post(
    "/api/unsubscribe",
    asyncHandler(async (req, res) => {
      try {
        const token = String(req.query.token ?? "");
        const verified = verifyUnsubscribeToken(token);
        if (!verified) {
          // HTML, not JSON: this is reached both by RFC 8058 one-click mail
          // clients (which ignore the body) AND by a human submitting the GET
          // confirmation form - the human must see a page, not raw JSON.
          return res
            .status(400)
            .type("html")
            .send(htmlPage("Invalid link", "This unsubscribe link is invalid or has expired."));
        }
        const { ok } = await applyUnsubscribe(verified.userId, verified.list);
        if (!ok) {
          return res
            .status(400)
            .type("html")
            .send(
              htmlPage("Unknown list", "We couldn't find that email list to unsubscribe from."),
            );
        }
        logger.info(
          { userId: verified.userId, list: verified.list },
          "unsubscribe: applied (POST)",
        );
        return res
          .status(200)
          .type("html")
          .send(
            htmlPage(
              "You're unsubscribed",
              "You won't receive these emails anymore. You can re-enable them anytime from your account settings.",
            ),
          );
      } catch (err) {
        logger.error({ err }, "unsubscribe POST failed");
        captureAndFlush(err, { tags: { source: "unsubscribe-post" } });
        return res
          .status(500)
          .type("html")
          .send(
            htmlPage(
              "Something went wrong",
              "We couldn't process your unsubscribe right now. Please try the link again.",
            ),
          );
      }
    }),
  );

  // GET = browser landing page. MUST NOT mutate: email link-prefetchers
  // (Gmail image proxy, corporate link scanners) auto-issue GET requests,
  // which would otherwise silently unsubscribe users. So GET only verifies
  // the HMAC token and renders a confirmation page whose button POSTs back
  // to this same endpoint - the POST handler above performs the real change.
  app.get(
    "/api/unsubscribe",
    asyncHandler(async (req, res) => {
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
        // NON-mutating: render a confirmation page only. The button POSTs
        // the same signed token back to /api/unsubscribe, where the real
        // mutation happens. This prevents automated GET prefetches from
        // unsubscribing users without an explicit click.
        logger.info(
          { userId: verified.userId, list: verified.list },
          "unsubscribe: confirmation page shown (GET)",
        );
        const listLabel = escape(verified.list.replace("_", " "));
        return res
          .type("html")
          .send(
            htmlPage(
              "Confirm unsubscribe",
              `You're about to stop receiving <strong>${listLabel}</strong> emails. ` +
                "Click the button below to confirm - you can re-enable them anytime from your account settings." +
                `<form method="POST" action="/api/unsubscribe?token=${encodeURIComponent(token)}" style="margin-top:24px">` +
                `<button type="submit" style="display:inline-block;background:#7c3aed;color:#fff;border:0;padding:12px 24px;border-radius:6px;font-size:16px;cursor:pointer">Confirm unsubscribe</button>` +
                "</form>",
            ),
          );
      } catch (err) {
        logger.error({ err }, "unsubscribe GET failed");
        captureAndFlush(err, { tags: { source: "unsubscribe-get" } });
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
    }),
  );
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
