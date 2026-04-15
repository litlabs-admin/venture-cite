import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || "VentureCite <reports@venturecite.app>";
const APP_URL = process.env.APP_URL || "https://venturecite.app";

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
  userEmail: string;
  firstName?: string | null;
  brands: BrandReport[];
};

export function isEmailConfigured(): boolean {
  return resend !== null;
}

export async function sendWeeklyVisibilityReport(data: WeeklyReportData): Promise<boolean> {
  if (!resend) {
    console.warn("[email] Resend not configured — skipping weekly report");
    return false;
  }

  const greeting = data.firstName ? `Hi ${data.firstName},` : "Hi,";
  const weekOf = new Date().toLocaleDateString();

  const totalCitedAllBrands = data.brands.reduce((s, b) => s + b.totalCited, 0);
  const totalChecksAllBrands = data.brands.reduce((s, b) => s + b.totalChecks, 0);

  const brandSections = data.brands.map((brand) => {
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
  }).join("");

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

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: data.userEmail,
      subject: `Your Weekly AI Visibility Report — ${totalCitedAllBrands} citation${totalCitedAllBrands === 1 ? "" : "s"}`,
      html,
    });
    return true;
  } catch (err) {
    console.error("[email] Failed to send weekly report:", err);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
