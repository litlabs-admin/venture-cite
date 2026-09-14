// Pure derivation for the two "My work" opportunity boards (earned media,
// content inventory). No database import on purpose: the route handler reads
// rows through `storage`, and everything here is a plain function of those
// rows so it can be unit tested with fixture arrays instead of a database.
//
// Every enum value below (topic match, effort, confidence, evidence type,
// relationship, visibility gap, evidence quality) is computed from a real
// column on a real row - never invented. The formulas are deliberately
// simple and documented inline so a reviewer can trace each label back to
// the field that produced it.
import type { TaskState } from "@shared/work";

export type OpportunityLevel = "Low" | "Medium" | "High";

// ---------------------------------------------------------------------------
// Board 40: earned media opportunities
// ---------------------------------------------------------------------------

export type ListicleRecord = {
  id: string;
  title: string;
  url: string;
  sourcePublication: string | null;
  isIncluded: number;
  listPosition: number | null;
  totalListItems: number | null;
  domainAuthority: number | null;
  searchVolume: number | null;
  outreachStatus: string;
  lastChecked: string;
};

export type CommunityPostRecord = {
  id: string;
  platform: string;
  groupName: string;
  groupUrl: string | null;
  content: string;
  status: string;
  keywords: string[] | null;
  createdAt: string;
};

export type BrandMentionRecord = {
  id: string;
  platform: string;
  sourceUrl: string;
  sourceTitle: string | null;
  mentionContext: string | null;
  sentiment: string | null;
  isVerified: number;
  status: string;
  mentionedAt: string | null;
  discoveredAt: string;
};

export type GeoRankingRecord = {
  id: string;
  brandPromptId: string | null;
  aiPlatform: string;
  prompt: string;
  isCited: number;
  citedUrls: string[] | null;
  citationContext: string | null;
  checkedAt: string;
};

export type BrandPromptRecord = { id: string; prompt: string };

export type EarnedMediaSourceType = "listicle" | "community" | "mention" | "citation";
export type EarnedMediaRelationship = "No contact" | "Warm contact" | "Existing contact";
export type EarnedMediaEvidenceType = "Citation gap" | "Question thread" | "Existing mention";
export type EarnedMediaStatus = "Not started" | "In progress" | "Completed" | "Not a fit";

export type EarnedMediaOpportunity = {
  id: string;
  sourceType: EarnedMediaSourceType;
  sourceTypeLabel: string;
  sourceName: string;
  sourceUrl: string | null;
  topicMatch: OpportunityLevel;
  affectedQuestionCount: number;
  relationship: EarnedMediaRelationship;
  evidenceType: EarnedMediaEvidenceType;
  effort: OpportunityLevel;
  confidence: OpportunityLevel;
  status: EarnedMediaStatus;
  canUpdateStatus: boolean;
  taskKey: string;
  detail: {
    headline: string;
    quote: string | null;
    quoteAttribution: string | null;
    observedAt: string | null;
  };
};

export type EarnedMediaBoard = {
  counts: { all: number; listicle: number; community: number; mention: number; citation: number };
  outreachCounts: {
    notStarted: number;
    inProgress: number;
    completed: number;
    notFit: number;
  };
  opportunities: EarnedMediaOpportunity[];
};

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "what",
  "does",
  "your",
  "that",
  "this",
  "from",
  "have",
  "will",
  "would",
  "should",
  "about",
  "into",
  "than",
  "when",
  "where",
  "which",
  "their",
  "there",
]);

function significantTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word)),
  );
}

/** Count of tracked buyer prompts whose text shares a significant word with `text`. */
function countAffectedQuestions(text: string, prompts: readonly BrandPromptRecord[]): number {
  const tokens = significantTokens(text);
  if (tokens.size === 0) return 0;
  let count = 0;
  for (const prompt of prompts) {
    const promptTokens = significantTokens(prompt.prompt);
    for (const token of promptTokens) {
      if (tokens.has(token)) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

function levelForCount(count: number): OpportunityLevel {
  if (count >= 3) return "High";
  if (count >= 1) return "Medium";
  return "Low";
}

function taskStateToStatus(state: TaskState | undefined): EarnedMediaStatus | undefined {
  if (state === undefined) return undefined;
  switch (state) {
    case "suggested":
    case "accepted":
    case "in_progress":
    case "submitted":
    case "reopened":
      return "In progress";
    case "verified":
      return "Completed";
    case "dismissed":
    case "not_applicable":
      return "Not a fit";
    case "waiting_for_observation":
      return "In progress";
    default:
      return undefined;
  }
}

function listicleOpportunity(
  record: ListicleRecord,
  prompts: readonly BrandPromptRecord[],
  taskState: TaskState | undefined,
): EarnedMediaOpportunity {
  const affected = countAffectedQuestions(record.title, prompts);
  const relationship: EarnedMediaRelationship =
    record.outreachStatus === "won"
      ? "Existing contact"
      : record.outreachStatus === "contacted"
        ? "Warm contact"
        : "No contact";
  const statusFromRecord: EarnedMediaStatus =
    record.outreachStatus === "won"
      ? "Completed"
      : record.outreachStatus === "contacted"
        ? "In progress"
        : record.outreachStatus === "dropped"
          ? "Not a fit"
          : "Not started";
  const highAuthority = record.domainAuthority !== null && record.domainAuthority >= 60;
  return {
    id: `listicle:${record.id}`,
    sourceType: "listicle",
    sourceTypeLabel: "Listicle mention",
    sourceName: record.sourcePublication ?? hostnameOf(record.url) ?? record.title,
    sourceUrl: record.url,
    topicMatch: levelForCount(affected),
    affectedQuestionCount: affected,
    relationship,
    evidenceType: "Citation gap",
    effort: relationship !== "No contact" ? "Low" : highAuthority ? "High" : "Medium",
    confidence:
      record.domainAuthority !== null && record.searchVolume !== null
        ? "High"
        : record.domainAuthority !== null
          ? "Medium"
          : "Low",
    status: taskStateToStatus(taskState) ?? statusFromRecord,
    canUpdateStatus: true,
    taskKey: `v2earned:listicle:${record.id}`,
    detail: {
      headline:
        record.listPosition !== null && record.totalListItems !== null
          ? `"${record.title}" ranks ${record.listPosition} of ${record.totalListItems} on ${record.sourcePublication ?? hostnameOf(record.url) ?? "this source"} and does not include the brand.`
          : `"${record.title}" is a "best of" list on ${record.sourcePublication ?? hostnameOf(record.url) ?? "this source"} that does not include the brand.`,
      quote: null,
      quoteAttribution: null,
      observedAt: record.lastChecked,
    },
  };
}

function communityOpportunity(
  record: CommunityPostRecord,
  prompts: readonly BrandPromptRecord[],
  taskState: TaskState | undefined,
): EarnedMediaOpportunity {
  const matchText = `${record.content} ${(record.keywords ?? []).join(" ")}`;
  const affected = countAffectedQuestions(matchText, prompts);
  const relationship: EarnedMediaRelationship =
    record.status === "draft" ? "No contact" : "Existing contact";
  const statusFromRecord: EarnedMediaStatus =
    record.status === "draft"
      ? "Not started"
      : record.status === "posted"
        ? "Completed"
        : "In progress";
  return {
    id: `community:${record.id}`,
    sourceType: "community",
    sourceTypeLabel: "Community discussion",
    sourceName: `${record.groupName} (${record.platform})`,
    sourceUrl: record.groupUrl,
    topicMatch: levelForCount(affected),
    affectedQuestionCount: affected,
    relationship,
    evidenceType: "Question thread",
    effort: "Low",
    confidence: (record.keywords ?? []).length > 0 ? "Medium" : "Low",
    status: taskStateToStatus(taskState) ?? statusFromRecord,
    canUpdateStatus: true,
    taskKey: `v2earned:community:${record.id}`,
    detail: {
      headline: `A draft ${record.platform} post for ${record.groupName} has content and a target group ready to complete.`,
      quote: record.content.length > 240 ? `${record.content.slice(0, 240)}…` : record.content,
      quoteAttribution: `${record.platform} · ${record.groupName}`,
      observedAt: record.createdAt,
    },
  };
}

function mentionOpportunity(
  record: BrandMentionRecord,
  prompts: readonly BrandPromptRecord[],
  taskState: TaskState | undefined,
): EarnedMediaOpportunity {
  const affected = countAffectedQuestions(
    record.mentionContext ?? record.sourceTitle ?? "",
    prompts,
  );
  const relationship: EarnedMediaRelationship =
    record.status === "replied" ? "Existing contact" : "Warm contact";
  const statusFromRecord: EarnedMediaStatus =
    record.status === "replied"
      ? "Completed"
      : record.status === "false_positive" || record.status === "ignored"
        ? "Not a fit"
        : record.status === "acknowledged"
          ? "In progress"
          : "Not started";
  return {
    id: `mention:${record.id}`,
    sourceType: "mention",
    sourceTypeLabel: "Existing mention",
    sourceName: record.sourceTitle ?? hostnameOf(record.sourceUrl) ?? record.platform,
    sourceUrl: record.sourceUrl,
    topicMatch: levelForCount(affected),
    affectedQuestionCount: affected,
    relationship,
    evidenceType: "Existing mention",
    effort: "Low",
    confidence:
      record.isVerified === 1 ? "High" : record.sentiment === "positive" ? "Medium" : "Low",
    status: taskStateToStatus(taskState) ?? statusFromRecord,
    canUpdateStatus: true,
    taskKey: `v2earned:mention:${record.id}`,
    detail: {
      headline: `${record.platform} already mentioned the brand${record.sourceTitle ? ` in "${record.sourceTitle}"` : ""}. Deepen it into full coverage.`,
      quote: record.mentionContext,
      quoteAttribution: record.platform,
      observedAt: record.mentionedAt ?? record.discoveredAt,
    },
  };
}

function citationOpportunities(
  geoRankings: readonly GeoRankingRecord[],
  prompts: readonly BrandPromptRecord[],
  claimedDomains: ReadonlySet<string>,
  ownDomain: string | null,
  taskStateFor: (id: string) => TaskState | undefined,
): EarnedMediaOpportunity[] {
  const promptById = new Map(prompts.map((p) => [p.id, p]));
  const byDomain = new Map<string, { promptIds: Set<string>; sample: GeoRankingRecord }>();
  for (const row of geoRankings) {
    if (row.isCited === 1) continue; // the brand itself was cited in this response
    if (!row.brandPromptId || !promptById.has(row.brandPromptId)) continue;
    for (const url of row.citedUrls ?? []) {
      const domain = hostnameOf(url);
      if (!domain || domain === ownDomain || claimedDomains.has(domain)) continue;
      const entry = byDomain.get(domain) ?? { promptIds: new Set<string>(), sample: row };
      entry.promptIds.add(row.brandPromptId);
      byDomain.set(domain, entry);
    }
  }
  return [...byDomain.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([domain, entry]) => {
      const id = `citation:${domain}`;
      const affected = entry.promptIds.size;
      return {
        id,
        sourceType: "citation" as const,
        sourceTypeLabel: "AI-cited source",
        sourceName: domain,
        sourceUrl: `https://${domain}`,
        topicMatch: levelForCount(affected),
        affectedQuestionCount: affected,
        relationship: "No contact" as const,
        evidenceType: "Citation gap" as const,
        effort: "Medium" as const,
        confidence: affected >= 2 ? "High" : ("Medium" as const),
        status: taskStateToStatus(taskStateFor(id)) ?? "Not started",
        canUpdateStatus: false,
        taskKey: `v2earned:citation:${domain}`,
        detail: {
          headline: `AI answers for tracked buyer questions cite ${domain} while leaving the brand out.`,
          quote: entry.sample.citationContext,
          quoteAttribution: `${entry.sample.aiPlatform}, checked ${entry.sample.checkedAt}`,
          observedAt: entry.sample.checkedAt,
        },
      };
    });
}

export function deriveEarnedMediaBoard(input: {
  ownDomain: string | null;
  listicles: readonly ListicleRecord[];
  communityPosts: readonly CommunityPostRecord[];
  brandMentions: readonly BrandMentionRecord[];
  geoRankings: readonly GeoRankingRecord[];
  brandPrompts: readonly BrandPromptRecord[];
  taskStateByTaskKey: ReadonlyMap<string, TaskState>;
}): EarnedMediaBoard {
  const notIncluded = input.listicles.filter((row) => row.isIncluded === 0);
  const claimedDomains = new Set<string>();
  for (const row of notIncluded) {
    const domain = hostnameOf(row.url);
    if (domain) claimedDomains.add(domain);
  }
  for (const row of input.brandMentions) {
    const domain = hostnameOf(row.sourceUrl);
    if (domain) claimedDomains.add(domain);
  }
  for (const row of input.communityPosts) {
    const domain = hostnameOf(row.groupUrl);
    if (domain) claimedDomains.add(domain);
  }

  const stateFor = (taskKey: string) => input.taskStateByTaskKey.get(taskKey);

  const listicleOpportunities = notIncluded.map((row) =>
    listicleOpportunity(row, input.brandPrompts, stateFor(`v2earned:listicle:${row.id}`)),
  );
  const communityOpportunities = input.communityPosts.map((row) =>
    communityOpportunity(row, input.brandPrompts, stateFor(`v2earned:community:${row.id}`)),
  );
  const mentionOpportunities = input.brandMentions
    .filter((row) => row.status !== "false_positive" && row.status !== "ignored")
    .map((row) =>
      mentionOpportunity(row, input.brandPrompts, stateFor(`v2earned:mention:${row.id}`)),
    );
  const citationRows = citationOpportunities(
    input.geoRankings,
    input.brandPrompts,
    claimedDomains,
    input.ownDomain,
    (id) => input.taskStateByTaskKey.get(`v2earned:${id}`),
  );

  const opportunities = [
    ...listicleOpportunities,
    ...communityOpportunities,
    ...mentionOpportunities,
    ...citationRows,
  ].sort((a, b) => b.affectedQuestionCount - a.affectedQuestionCount || a.id.localeCompare(b.id));

  const outreachCounts = { notStarted: 0, inProgress: 0, completed: 0, notFit: 0 };
  for (const item of opportunities) {
    if (item.status === "Not started") outreachCounts.notStarted += 1;
    else if (item.status === "In progress") outreachCounts.inProgress += 1;
    else if (item.status === "Completed") outreachCounts.completed += 1;
    else outreachCounts.notFit += 1;
  }

  return {
    counts: {
      all: opportunities.length,
      listicle: listicleOpportunities.length,
      community: communityOpportunities.length,
      mention: mentionOpportunities.length,
      citation: citationRows.length,
    },
    outreachCounts,
    opportunities,
  };
}

// ---------------------------------------------------------------------------
// Board 41: content opportunity inventory
// ---------------------------------------------------------------------------

export type ContentPageSourceType = "bofu" | "faq" | "article";
export type ContentEvidenceQuality = "Weak" | "Fair" | "Good" | "Strong";
export type ContentStatus = "High priority" | "Needs update" | "Minor update" | "Up to date";
export type ContentEffort = "S" | "M" | "L";

export type BofuContentRecord = {
  id: string;
  contentType: string;
  title: string;
  content: string;
  primaryKeyword: string | null;
  targetIntent: string | null;
  status: string | null;
  aiScore: number | null;
  publishedUrl: string | null;
  updatedAt: string;
};

export type FaqItemRecord = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  aiSurfaceScore: number | null;
  publishedUrl: string | null;
  updatedAt: string;
};

export type ArticleRecord = {
  id: string;
  title: string | null;
  contentType: string | null;
  keywords: string[] | null;
  citationCount: number;
  externalUrl: string | null;
  updatedAt: string;
};

export type TrackedContentUrlRecord = {
  sourceType: string;
  sourceId: string;
  normalizedUrl: string;
};

export type ContentPage = {
  id: string;
  sourceType: ContentPageSourceType;
  title: string;
  /** Null when the content has no live URL yet - it exists but is not published. */
  path: string | null;
  type: string;
  questionsCovered: number;
  coveredQuestionIds: string[];
  visibilityGap: OpportunityLevel | null;
  evidenceQuality: ContentEvidenceQuality | null;
  freshness: string;
  recommendedChange: string;
  effort: ContentEffort;
  status: ContentStatus;
  taskKey: string;
};

export type UnmappedQuestion = { id: string; prompt: string };

export type ContentOpportunityBoard = {
  pages: ContentPage[];
  unmappedQuestions: UnmappedQuestion[];
  coverageGapCount: number;
  duplicateTopicCount: number;
  pagesWithoutEvidenceCount: number;
  prioritizedAction: {
    pageId: string;
    pageName: string;
    question: string | null;
    recommendedChange: string;
  } | null;
};

function normalizeUrlLoose(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function evidenceQualityFromScore(
  score: number | null,
  fallbackLength: number,
): ContentEvidenceQuality {
  if (score !== null) {
    if (score >= 75) return "Strong";
    if (score >= 50) return "Good";
    if (score >= 25) return "Fair";
    return "Weak";
  }
  if (fallbackLength > 1500) return "Good";
  if (fallbackLength > 500) return "Fair";
  return "Weak";
}

function coveredQuestionIds(text: string, prompts: readonly BrandPromptRecord[]): string[] {
  const tokens = significantTokens(text);
  if (tokens.size === 0) return [];
  const ids: string[] = [];
  for (const prompt of prompts) {
    const promptTokens = significantTokens(prompt.prompt);
    for (const token of promptTokens) {
      if (tokens.has(token)) {
        ids.push(prompt.id);
        break;
      }
    }
  }
  return ids;
}

function visibilityGapFor(
  coveredIds: readonly string[],
  normalizedPath: string,
  geoRankings: readonly GeoRankingRecord[],
): OpportunityLevel | null {
  if (coveredIds.length === 0) return null;
  const relevant = geoRankings.filter(
    (row) => row.brandPromptId !== null && coveredIds.includes(row.brandPromptId),
  );
  if (relevant.length === 0) return null;
  const citedHere = relevant.filter((row) =>
    (row.citedUrls ?? []).some((url) => normalizeUrlLoose(url) === normalizedPath),
  ).length;
  const gapRatio = 1 - citedHere / relevant.length;
  if (gapRatio >= 0.66) return "High";
  if (gapRatio >= 0.33) return "Medium";
  return "Low";
}

function effortAndStatus(
  evidenceQuality: ContentEvidenceQuality | null,
  visibilityGap: OpportunityLevel | null,
  freshness: string,
  published: boolean,
): { effort: ContentEffort; status: ContentStatus; recommendedChange: string } {
  if (!published) {
    return {
      effort: "M",
      status: "Needs update",
      recommendedChange:
        "Publish this page - it has no live URL yet, so it cannot be evaluated or cited.",
    };
  }
  const weak = evidenceQuality === "Weak";
  const fair = evidenceQuality === "Fair";
  const highGap = visibilityGap === "High";
  const mediumGap = visibilityGap === "Medium";
  const staleMs = Date.now() - new Date(freshness).getTime();
  const staleDays = Number.isFinite(staleMs) ? staleMs / (1000 * 60 * 60 * 24) : 0;

  if (weak && highGap) {
    return {
      effort: "L",
      status: "High priority",
      recommendedChange:
        "Add clear program details, examples, and what's included to reduce buyer friction.",
    };
  }
  if (weak || fair) {
    return {
      effort: "M",
      status: "Needs update",
      recommendedChange: "Add customer proof, data, and specific examples.",
    };
  }
  if (highGap || mediumGap) {
    return {
      effort: "M",
      status: "Needs update",
      recommendedChange:
        "Expand the answer with the exact wording buyers use, then recheck citations.",
    };
  }
  if (staleDays > 90) {
    return {
      effort: "S",
      status: "Minor update",
      recommendedChange: "Refresh this page's details; it has not been updated in over 90 days.",
    };
  }
  return {
    effort: "S",
    status: "Up to date",
    recommendedChange: "Keep this page current; it already covers its buyer question well.",
  };
}

function findNormalizedPath(
  sourceType: ContentPageSourceType,
  sourceId: string,
  path: string,
  trackedContentUrls: readonly TrackedContentUrlRecord[],
): string {
  const matchSourceType = sourceType === "bofu" ? "bofu" : sourceType === "faq" ? "faq" : null;
  if (matchSourceType) {
    const tracked = trackedContentUrls.find(
      (row) => row.sourceType === matchSourceType && row.sourceId === sourceId,
    );
    if (tracked) return tracked.normalizedUrl;
  }
  return normalizeUrlLoose(path);
}

export function deriveContentOpportunityBoard(input: {
  bofuContent: readonly BofuContentRecord[];
  faqItems: readonly FaqItemRecord[];
  articles: readonly ArticleRecord[];
  trackedContentUrls: readonly TrackedContentUrlRecord[];
  brandPrompts: readonly BrandPromptRecord[];
  geoRankings: readonly GeoRankingRecord[];
}): ContentOpportunityBoard {
  const pages: ContentPage[] = [];

  for (const row of input.bofuContent) {
    const matchText = `${row.title} ${row.primaryKeyword ?? ""} ${row.targetIntent ?? ""}`;
    const covered = coveredQuestionIds(matchText, input.brandPrompts);
    const published = row.publishedUrl !== null;
    const normalizedPath = row.publishedUrl
      ? findNormalizedPath("bofu", row.id, row.publishedUrl, input.trackedContentUrls)
      : null;
    const evidenceQuality = evidenceQualityFromScore(row.aiScore, row.content.length);
    const visibilityGap = normalizedPath
      ? visibilityGapFor(covered, normalizedPath, input.geoRankings)
      : null;
    const { effort, status, recommendedChange } = effortAndStatus(
      evidenceQuality,
      visibilityGap,
      row.updatedAt,
      published,
    );
    pages.push({
      id: `bofu:${row.id}`,
      sourceType: "bofu",
      title: row.title,
      path: row.publishedUrl,
      type: row.contentType,
      questionsCovered: covered.length,
      coveredQuestionIds: covered,
      visibilityGap,
      evidenceQuality,
      freshness: row.updatedAt,
      recommendedChange,
      effort,
      status,
      taskKey: `v2content:bofu:${row.id}`,
    });
  }

  for (const row of input.faqItems) {
    const matchText = `${row.question} ${row.category ?? ""}`;
    const covered = coveredQuestionIds(matchText, input.brandPrompts);
    const published = row.publishedUrl !== null;
    const normalizedPath = row.publishedUrl
      ? findNormalizedPath("faq", row.id, row.publishedUrl, input.trackedContentUrls)
      : null;
    const evidenceQuality = evidenceQualityFromScore(row.aiSurfaceScore, row.answer.length);
    const visibilityGap = normalizedPath
      ? visibilityGapFor(covered, normalizedPath, input.geoRankings)
      : null;
    const { effort, status, recommendedChange } = effortAndStatus(
      evidenceQuality,
      visibilityGap,
      row.updatedAt,
      published,
    );
    pages.push({
      id: `faq:${row.id}`,
      sourceType: "faq",
      title: row.question,
      path: row.publishedUrl,
      type: "FAQ",
      questionsCovered: covered.length,
      coveredQuestionIds: covered,
      visibilityGap,
      evidenceQuality,
      freshness: row.updatedAt,
      recommendedChange,
      effort,
      status,
      taskKey: `v2content:faq:${row.id}`,
    });
  }

  for (const row of input.articles) {
    if (!row.title) continue;
    const matchText = `${row.title} ${(row.keywords ?? []).join(" ")}`;
    const covered = coveredQuestionIds(matchText, input.brandPrompts);
    const published = row.externalUrl !== null;
    const normalizedPath = row.externalUrl ? normalizeUrlLoose(row.externalUrl) : null;
    const evidenceQuality: ContentEvidenceQuality = row.citationCount > 0 ? "Good" : "Fair";
    const visibilityGap = normalizedPath
      ? visibilityGapFor(covered, normalizedPath, input.geoRankings)
      : null;
    const { effort, status, recommendedChange } = effortAndStatus(
      evidenceQuality,
      visibilityGap,
      row.updatedAt,
      published,
    );
    pages.push({
      id: `article:${row.id}`,
      sourceType: "article",
      title: row.title,
      path: row.externalUrl,
      type: row.contentType ?? "Article",
      questionsCovered: covered.length,
      coveredQuestionIds: covered,
      visibilityGap,
      evidenceQuality,
      freshness: row.updatedAt,
      recommendedChange,
      effort,
      status,
      taskKey: `v2content:article:${row.id}`,
    });
  }

  pages.sort((a, b) => {
    const rank: Record<ContentStatus, number> = {
      "High priority": 0,
      "Needs update": 1,
      "Minor update": 2,
      "Up to date": 3,
    };
    return rank[a.status] - rank[b.status] || a.title.localeCompare(b.title);
  });

  const coveredIds = new Set(pages.flatMap((page) => page.coveredQuestionIds));
  const unmappedQuestions = input.brandPrompts
    .filter((prompt) => !coveredIds.has(prompt.id))
    .map((prompt) => ({ id: prompt.id, prompt: prompt.prompt }));

  // Duplicate topics: pages whose title/primary-keyword reduces to the same
  // leading significant token. Simple and real - not a fabricated cluster.
  const topicGroups = new Map<string, ContentPage[]>();
  for (const page of pages) {
    const [topic] = [...significantTokens(page.title)];
    if (!topic) continue;
    const group = topicGroups.get(topic) ?? [];
    group.push(page);
    topicGroups.set(topic, group);
  }
  const duplicateTopicCount = [...topicGroups.values()].filter((group) => group.length > 1).length;

  const pagesWithoutEvidenceCount = pages.filter((page) => page.evidenceQuality === "Weak").length;

  const topPage = pages.find((page) => page.status === "High priority") ?? pages[0];
  const prioritizedAction = topPage
    ? {
        pageId: topPage.id,
        pageName: topPage.title,
        question:
          input.brandPrompts.find((p) => topPage.coveredQuestionIds.includes(p.id))?.prompt ?? null,
        recommendedChange: topPage.recommendedChange,
      }
    : null;

  return {
    pages,
    unmappedQuestions,
    coverageGapCount: unmappedQuestions.length,
    duplicateTopicCount,
    pagesWithoutEvidenceCount,
    prioritizedAction,
  };
}
