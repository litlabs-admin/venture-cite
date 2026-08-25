import type { SiteHealthFinding } from "@shared/siteHealthFindings";

export interface SiteHealthPage {
  url: string;
  statusCode: number | null;
  status: string;
  errorKind: string | null;
  contentType: string | null;
  factCount: number;
  severity: "critical" | "high" | "medium" | "low" | "ok";
  /** Structural finding ids this page trips (failed-pages/thin-content).
   *  Content findings (meta tags, OG, ...) aren't per-page here - see
   *  shared/siteHealthFindings.ts pageFindingIds(). */
  findingIds: string[];
}

export interface SiteHealthScanHistoryEntry {
  id: string;
  runId: string | null;
  score: number | null;
  pagesCrawled: number | null;
  pagesFailed: number | null;
  issues: { critical: number; high: number; medium: number; low: number };
  createdAt: string;
}

export type { SiteHealthFinding };
