// shared/diagnoseTypes.ts
//
// Shared types for the /diagnose Issues queue. Both client and server
// import from here so the contract is single-sourced.

export type IssueType =
  | "hallucination"
  | "listicle_gap"
  | "wikipedia_gap"
  | "crawler_block"
  | "weak_signal"
  | "missing_schema"
  | "stale_article";

export type IssueSeverity = "critical" | "high" | "medium" | "low";

export type IssueStatus = "open" | "in_progress" | "resolved";

export type Issue = {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  status: IssueStatus;
  title: string;
  subtitle: string;
  age: string; // pre-formatted ISO or relative — server decides
  ctaLabel: string;
  ctaHref?: string; // direct nav (e.g. stale article → /content/:id)
  inspectorKey?: string; // when set, opens IssueDetailSheet with this key
  metadata: Record<string, unknown>;
};

export type IssueStats = Record<IssueType, number>;

export type IssuesResponse = {
  success: true;
  data: {
    stats: IssueStats;
    items: Issue[];
  };
};
