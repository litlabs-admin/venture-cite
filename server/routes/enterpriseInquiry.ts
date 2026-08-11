import type { Express, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { asyncHandler } from "../lib/routesShared";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentryReport";
import { sendOutreachEmailViaResend } from "../emailService";

// ─── Enterprise inquiry ──────────────────────────────────────────────────────
// Enterprise is sales-led: no Stripe product, no price, no self-serve
// checkout. This is the other half of that decision - the pricing page's
// "Talk to us" card posts here.
//
// Deliberately unauthenticated. The whole point is to hear from people who do
// not have an account yet, so requiring a login would defeat it.
//
// The submission is LOGGED before the email is attempted, and the log line is
// the durable record. Resend can be unconfigured (no RESEND_API_KEY in a dev
// or preview environment) or simply fail, and a lead that only ever existed
// inside a failed HTTP call is a lead lost - the person is not going to fill
// the form in twice.

const INQUIRY_TO = process.env.ENTERPRISE_INQUIRY_TO || "info@venturecite.com";

const MAX = { name: 120, email: 200, company: 200, message: 2000 } as const;

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Deliberately permissive. This gates obvious junk, not deliverability - a
// regex that rejects a real address costs a sales conversation, which is worth
// far more than the spam it would have stopped.
function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 5 per IP per hour, matching the other public write endpoints in
// server/auth.ts (register is 5/hr on the same shape). Every POST here sends
// a real email, so without a limit this is an inbox-bombing and Resend-quota
// vector that anyone can script - it is the only public POST in the app that
// had no limiter.
const inquiryRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "unknown")}`,
  message: {
    success: false,
    error: "Too many enquiries from this address. Please try again later.",
  },
});

export function setupEnterpriseInquiryRoutes(app: Express): void {
  app.post(
    "/api/enterprise-inquiry",
    inquiryRateLimit,
    asyncHandler(async (req: Request, res: Response) => {
      const name = clean(req.body?.name, MAX.name);
      const email = clean(req.body?.email, MAX.email);
      const company = clean(req.body?.company, MAX.company);
      const message = clean(req.body?.message, MAX.message);

      if (!name || !email) {
        return res.status(400).json({ success: false, error: "Name and email are required." });
      }
      if (!looksLikeEmail(email)) {
        return res.status(400).json({ success: false, error: "That email doesn't look right." });
      }

      // The record of the lead. Written first and unconditionally, so a
      // failure to send the notification never loses the enquiry itself.
      logger.info(
        { name, email, company, messageLength: message.length },
        "enterprise-inquiry received",
      );

      try {
        await sendOutreachEmailViaResend({
          to: INQUIRY_TO,
          subject: `Enterprise enquiry - ${company || name}`,
          html: [
            `<p><strong>Name:</strong> ${escapeHtml(name)}</p>`,
            `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
            company ? `<p><strong>Company:</strong> ${escapeHtml(company)}</p>` : "",
            message ? `<p><strong>Message:</strong><br>${escapeHtml(message)}</p>` : "",
          ].join(""),
        });
      } catch (err) {
        // Reported, not surfaced. The enquiry is already in the log above, so
        // telling the visitor it failed would send them away for no reason -
        // but this must page someone, or leads rot silently in a log nobody
        // reads.
        logger.error({ err, email }, "enterprise-inquiry: notification email failed");
        captureAndFlush(err, {
          tags: { source: "enterprise-inquiry" },
          extra: { email, company },
        });
      }

      return res.json({ success: true });
    }),
  );
}
