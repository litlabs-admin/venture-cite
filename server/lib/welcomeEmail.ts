import { Resend } from "resend";
import { logger } from "./logger";

// One-shot welcome email sent the first time a user successfully logs in
// after verifying their address. Kept deliberately small — Resend is the
// same provider used for the weekly digest, so we reuse the existing
// RESEND_API_KEY + RESEND_FROM_ADDRESS env vars instead of inventing new
// ones. Send failures are swallowed by the caller (welcome email is a
// nice-to-have, not a blocker for login).

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || "VentureCite <reports@venturecite.app>";
const APP_URL = process.env.APP_URL || "https://venturecite.app";

// Plan 4 audit (BUG #8): firstName lands inside an HTML email body. A
// user who registered with `firstName: "<script>"` (or worse, an
// `<img onerror>` payload) would have attacker-controlled HTML rendered
// in an email signed by our DKIM — brand-damage and content-spoof
// vector even if mail clients sanitize. Escape before interpolation.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendWelcomeEmail(to: string, firstName?: string | null): Promise<boolean> {
  if (!resend) {
    logger.info({ template: "welcome" }, "welcome email skipped — Resend not configured");
    return false;
  }
  const safeFirstName = firstName ? escapeHtml(firstName) : "";
  const greeting = safeFirstName ? `Hi ${safeFirstName},` : "Hi,";
  const plainGreeting = firstName ? `Hi ${firstName},` : "Hi,";
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h1 style="color:#dc2626;margin:0 0 12px">Welcome to VentureCite</h1>
  <p>${greeting}</p>
  <p>Thanks for verifying your email. Here's what to do next:</p>
  <ol style="line-height:1.6">
    <li>Add your brand to start tracking visibility across AI search.</li>
    <li>Watch the first citation scan complete (usually within a few minutes).</li>
    <li>Review your first round of recommendations.</li>
  </ol>
  <div style="margin-top:24px;text-align:center">
    <a href="${APP_URL}/welcome" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Get started</a>
  </div>
  <p style="color:#666;font-size:13px;margin-top:32px">If you have questions, just reply to this email.</p>
</body></html>`;

  // Plan 4 audit (BUG #7): Resend supports `text` alongside `html`.
  // Plain-text fallback improves spam-filter scoring and keeps clients
  // that prefer text (or strip HTML aggressively) readable.
  const text = `${plainGreeting}

Welcome to VentureCite. Thanks for verifying your email. Here's what to do next:

1. Add your brand to start tracking visibility across AI search.
2. Watch the first citation scan complete (usually within a few minutes).
3. Review your first round of recommendations.

Get started: ${APP_URL}/welcome

If you have questions, just reply to this email.`;

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: "Welcome to VentureCite",
      html,
      text,
    });
    const errObj = (result as { error?: { message?: string } }).error;
    if (errObj) {
      logger.warn({ err: errObj, to }, "welcome email send returned error");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err, to }, "welcome email send threw");
    return false;
  }
}
