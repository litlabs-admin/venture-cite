import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { signUnsubscribeToken } from "./lib/unsubscribeToken";
import { withEmailRetry } from "./lib/emailRetry";
import { db } from "./db";
import { users, emailFailures } from "@shared/schema";
import { logger } from "./lib/logger";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || "VentureCite <reports@venturecite.app>";
const APP_URL = process.env.APP_URL || "https://venturecite.app";

// Skip-send when the recipient's email_status is anything other than
// 'active' (bounced, complained, unsubscribed). Returns true when the
// caller should proceed with sending.
async function isAddressDeliverable(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return true; // anonymous send (waitlist confirmation, etc.)
  const [row] = await db
    .select({ status: users.emailStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return true;
  return row.status === "active";
}

async function recordEmailFailure(params: {
  userId: string | null;
  template: string;
  toAddress: string;
  payload: unknown;
  lastError: unknown;
  retryCount: number;
}): Promise<void> {
  try {
    const errMsg =
      params.lastError instanceof Error ? params.lastError.message : String(params.lastError);
    await db.insert(emailFailures).values({
      userId: params.userId,
      template: params.template,
      toAddress: params.toAddress,
      payloadJsonb: params.payload as Record<string, unknown>,
      lastError: errMsg.slice(0, 1000),
      retryCount: params.retryCount,
    });
  } catch (err) {
    logger.error({ err, template: params.template }, "email DLQ insert failed");
  }
}

export type PlatformStat = { platform: string; cited: number; checks: number };
export type TopPrompt = { prompt: string; cited: number; checks: number };

export type BrandReport = {
  name: string;
  totalChecks: number;
  totalCited: number;
  citationRate: number;
  platformStats: PlatformStat[];
  topPrompts: TopPrompt[];
  needsSetup: boolean;
};

export type WeeklyReportData = {
  userId: string;
  userEmail: string;
  firstName?: string | null;
  brands: BrandReport[];
};

export function isEmailConfigured(): boolean {
  return resend !== null;
}

// Low-level Resend send for outreach emails. Unlike the weekly-report
// emitter this one does NOT add unsubscribe footers (B2B outreach context).
// Caller supplies a brand-specific from address when provided, else falls
// back to FROM_ADDRESS. Throws on failure so the caller can mark the
// outreach_emails row as failed + surface the error to the task handler.
export async function sendOutreachEmailViaResend(params: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<{ messageId: string | null }> {
  if (!resend) {
    throw new Error("Resend not configured — set RESEND_API_KEY to send outreach email");
  }
  const from = params.from || FROM_ADDRESS;
  const result = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
  if ((result as { error?: unknown }).error) {
    const errObj = (result as { error?: { message?: string } }).error;
    throw new Error(errObj?.message || "Resend returned an error");
  }
  const data = (result as { data?: { id?: string } }).data;
  return { messageId: data?.id ?? null };
}

export async function sendWeeklyVisibilityReport(data: WeeklyReportData): Promise<boolean> {
  if (!resend) {
    console.warn("[email] Resend not configured — skipping weekly report");
    return false;
  }

  // Skip if the recipient is bounced/complained/unsubscribed. Returns true
  // here because skip is the *correct* outcome — the caller's stat
  // shouldn't count this as a failure (we just didn't try).
  if (!(await isAddressDeliverable(data.userId))) {
    logger.info(
      { userId: data.userId, template: "weekly_report" },
      "email skipped — recipient not deliverable",
    );
    return true;
  }

  const greeting = data.firstName ? `Hi ${data.firstName},` : "Hi,";
  const weekOf = new Date().toLocaleDateString();

  const totalCitedAllBrands = data.brands.reduce((s, b) => s + b.totalCited, 0);
  const totalChecksAllBrands = data.brands.reduce((s, b) => s + b.totalChecks, 0);

  const brandSections = data.brands
    .map((brand) => {
      if (brand.needsSetup) {
        return `
        <div style="margin-top:24px;padding:16px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px">
          <h3 style="margin:0 0 8px;color:#92400e">${escapeHtml(brand.name)}</h3>
          <p style="margin:0;color:#92400e;font-size:14px">
            No citation prompts have been generated for this brand yet.
            <a href="${APP_URL}/citations" style="color:#92400e;font-weight:600">Generate prompts</a>
            to start tracking visibility.
          </p>
        </div>`;
      }

      const platformRows = brand.platformStats.length
        ? brand.platformStats
            .map(
              (p) =>
                `<tr>
                <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(p.platform)}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${p.cited} / ${p.checks}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${p.checks > 0 ? Math.round((p.cited / p.checks) * 100) : 0}%</td>
              </tr>`,
            )
            .join("")
        : `<tr><td colspan="3" style="padding:12px;color:#888;text-align:center">No platform data.</td></tr>`;

      const topPromptRows = brand.topPrompts.length
        ? brand.topPrompts
            .map(
              (p) =>
                `<li style="margin-bottom:8px">
                <div style="font-weight:500">"${escapeHtml(p.prompt)}"</div>
                <div style="color:#666;font-size:12px">${p.cited} of ${p.checks} platforms cited your brand</div>
              </li>`,
            )
            .join("")
        : `<li style="color:#888">No prompts cited your brand this week.</li>`;

      return `
      <div style="margin-top:32px;padding:20px;background:#fafafa;border-radius:8px">
        <h2 style="margin:0 0 4px;font-size:20px">${escapeHtml(brand.name)}</h2>
        <p style="margin:0 0 16px;color:#666;font-size:14px">
          <strong>${brand.totalCited}</strong> of <strong>${brand.totalChecks}</strong> checks cited your brand
          (<strong>${brand.citationRate}%</strong> citation rate)
        </p>

        <h3 style="font-size:14px;margin:20px 0 8px;color:#333">Platform Performance</h3>
        <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:6px;overflow:hidden">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:8px;text-align:left;font-size:12px">Platform</th>
              <th style="padding:8px;text-align:right;font-size:12px">Cited / Checked</th>
              <th style="padding:8px;text-align:right;font-size:12px">Rate</th>
            </tr>
          </thead>
          <tbody>${platformRows}</tbody>
        </table>

        <h3 style="font-size:14px;margin:20px 0 8px;color:#333">Top Prompts</h3>
        <ul style="padding-left:20px;margin:0;font-size:14px">${topPromptRows}</ul>
      </div>`;
    })
    .join("");

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h1 style="color:#dc2626;margin:0 0 8px">Your Weekly AI Visibility Report</h1>
  <p style="color:#666;margin:0 0 24px">Week of ${weekOf}</p>
  <p>${greeting}</p>
  <p>This week, your brands were cited <strong>${totalCitedAllBrands}</strong> times across <strong>${totalChecksAllBrands}</strong> AI citation checks.</p>

  ${brandSections}

  <div style="margin-top:40px;text-align:center">
    <a href="${APP_URL}/citations" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">View Full Report</a>
  </div>

  <p style="color:#888;font-size:12px;margin-top:40px;text-align:center">
    You're receiving this because weekly reports are enabled on your VentureCite account.
    <a href="${APP_URL}/settings" style="color:#888">Manage preferences</a>
  </p>
</body></html>`;

  // List-Unsubscribe (RFC 2369) + List-Unsubscribe-Post (RFC 8058):
  // surfaces the native one-click unsubscribe button in Gmail / Outlook /
  // Apple Mail and protects deliverability. The token is HMAC-signed so
  // the URL alone authenticates the action — no session needed for the
  // unauth POST endpoint.
  const unsubToken = signUnsubscribeToken(data.userId, "weekly_report");
  const unsubUrl = `${APP_URL}/api/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

  // Wave 3.6: send via retry helper (3 retries / 1s/2s/4s backoff).
  // Permanent errors (invalid address, etc.) bail immediately and land
  // in the DLQ; transient errors get retried; success short-circuits.
  const subject = `Your Weekly AI Visibility Report — ${totalCitedAllBrands} citation${totalCitedAllBrands === 1 ? "" : "s"}`;
  const result = await withEmailRetry(() =>
    resend!.emails.send({
      from: FROM_ADDRESS,
      to: data.userEmail,
      subject,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  );

  if (result.ok) return true;

  await recordEmailFailure({
    userId: data.userId,
    template: "weekly_report",
    toAddress: data.userEmail,
    payload: { brands: data.brands.map((b) => ({ name: b.name, totalCited: b.totalCited })) },
    lastError: result.error,
    retryCount: result.attempts,
  });
  logger.error(
    { err: result.error, userId: data.userId, attempts: result.attempts },
    "[email] Failed to send weekly report after retries",
  );
  return false;
}

// ---------------------------------------------------------------------------
// Weekly agent digest — dedicated template (NOT the visibility report above).
// One entry per brand the user owns. Scheduler aggregates all of a user's
// per-brand weekly_catchup workflow runs into a single send.

export type WeeklyDigestBrandBrief = {
  brandName: string;
  currentScore: number;
  delta: number | null;
  newlyLost: string[];
  newlyWon: string[];
  hallucinationCount: number;
  topInsight: string;
  firstRun?: boolean;
};

export type WeeklyDigestPayload = {
  user: { id: string; email: string; firstName?: string | null };
  brandBriefs: WeeklyDigestBrandBrief[];
};

export async function sendWeeklyDigest(
  userEmail: string,
  digestPayload: WeeklyDigestPayload,
): Promise<boolean> {
  if (!resend) {
    logger.info("sendWeeklyDigest: Resend not configured — skipping");
    return false;
  }
  if (!(await isAddressDeliverable(digestPayload.user.id))) {
    logger.info(
      { userId: digestPayload.user.id, template: "weekly_digest" },
      "weekly digest skipped — recipient not deliverable",
    );
    // Return false so the aggregator does NOT stamp lastWeeklyReportSentAt.
    // Next run we'll try again; if the user fixes deliverability, we'll send.
    return false;
  }

  const { user, brandBriefs } = digestPayload;
  const greeting = user.firstName ? `Hi ${user.firstName},` : "Hi,";
  const weekOf = new Date().toLocaleDateString();
  const n = brandBriefs.length;
  const subject = `Your VentureCite Weekly Digest — ${n} brand${n === 1 ? "" : "s"}`;

  const brandSections = brandBriefs
    .map((b) => {
      const deltaLabel = b.firstRun
        ? `<span style="color:#6b7280">First week of data</span>`
        : b.delta === null
          ? `<span style="color:#6b7280">no prior data</span>`
          : b.delta >= 0
            ? `<span style="color:#16a34a">+${b.delta} pts</span>`
            : `<span style="color:#dc2626">${b.delta} pts</span>`;
      const firstRunNote = b.firstRun
        ? `<p style="margin:8px 0 0;color:#92400e;font-size:13px;font-style:italic">This is your first week of data — no prior comparison available.</p>`
        : "";
      const lostLine =
        !b.firstRun && b.newlyLost.length > 0
          ? `<li><strong>${b.newlyLost.length}</strong> prompt${b.newlyLost.length === 1 ? "" : "s"} newly lost</li>`
          : "";
      const wonLine =
        !b.firstRun && b.newlyWon.length > 0
          ? `<li><strong>${b.newlyWon.length}</strong> prompt${b.newlyWon.length === 1 ? "" : "s"} newly won</li>`
          : "";
      const hallLine =
        b.hallucinationCount > 0
          ? `<li><strong>${b.hallucinationCount}</strong> open hallucination${b.hallucinationCount === 1 ? "" : "s"}</li>`
          : "";
      const insightBlock = b.topInsight
        ? `<p style="margin:12px 0 0;color:#374151;font-size:14px">${escapeHtml(b.topInsight)}</p>`
        : "";
      return `
      <div style="margin-top:24px;padding:18px;background:#fafafa;border-radius:8px">
        <h2 style="margin:0 0 4px;font-size:18px">${escapeHtml(b.brandName)}</h2>
        <p style="margin:0;color:#4b5563;font-size:14px">
          Visibility: <strong>${b.currentScore}%</strong> · ${deltaLabel}
        </p>
        ${firstRunNote}
        <ul style="margin:10px 0 0;padding-left:20px;font-size:14px;color:#374151">
          ${lostLine}${wonLine}${hallLine}
        </ul>
        ${insightBlock}
      </div>`;
    })
    .join("");

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h1 style="color:#111827;margin:0 0 8px">Your VentureCite Weekly Digest</h1>
  <p style="color:#6b7280;margin:0 0 20px">Week of ${weekOf}</p>
  <p>${greeting}</p>
  <p>Here's the state of your ${n} brand${n === 1 ? "" : "s"} this week.</p>
  ${brandSections}
  <div style="margin-top:32px;text-align:center">
    <a href="${APP_URL}/dashboard" style="display:inline-block;background:#111827;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Open dashboard</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;margin-top:40px;text-align:center">
    You're receiving this because weekly digests are enabled on your VentureCite account.
    <a href="${APP_URL}/settings" style="color:#9ca3af">Manage preferences</a>
  </p>
</body></html>`;

  const unsubToken = signUnsubscribeToken(user.id, "weekly_report");
  const unsubUrl = `${APP_URL}/api/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

  const result = await withEmailRetry(() =>
    resend!.emails.send({
      from: FROM_ADDRESS,
      to: userEmail,
      subject,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  );

  if (result.ok) return true;

  await recordEmailFailure({
    userId: user.id,
    template: "weekly_digest",
    toAddress: userEmail,
    payload: {
      brandCount: brandBriefs.length,
      brands: brandBriefs.map((b) => ({ name: b.brandName, score: b.currentScore })),
    },
    lastError: result.error,
    retryCount: result.attempts,
  });
  logger.error(
    { err: result.error, userId: user.id, attempts: result.attempts },
    "[email] weekly digest failed after retries",
  );
  return false;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
