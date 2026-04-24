// Draft types + small formatting helpers shared between the Content page
// and its presentational sub-components (e.g. DraftToolbar).

export type ContentDraft = {
  id: string;
  userId: string;
  title: string | null;
  keywords: string;
  industry: string;
  type: string;
  brandId: string | null;
  targetCustomers: string | null;
  geography: string | null;
  contentStyle: string | null;
  generatedContent: string | null;
  articleId: string | null;
  jobId: string | null;
  humanScore: number | null;
  passesAiDetection: number | null; // 0=fails, 1=passes, null=unchecked
  createdAt: string;
  updatedAt: string;
};

export function draftStatus(draft: ContentDraft): "generating" | "done" | "draft" {
  if (draft.jobId) return "generating";
  if (draft.generatedContent) return "done";
  return "draft";
}

export function draftLabel(draft: ContentDraft): string {
  return draft.title || draft.keywords.split(",")[0]?.trim() || "Untitled";
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
