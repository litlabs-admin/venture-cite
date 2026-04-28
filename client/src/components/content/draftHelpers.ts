// Wave 7: drafts are unified into the articles table. The shape we render
// in the DraftToolbar dropdown is just the article row, status-aware.

import type { Article } from "@shared/schema";

// Anything in {draft, generating, failed} is "unfinished" — it shows up in
// the Recent Drafts dropdown rather than the Articles list.
export type DraftableArticle = Article;

export function draftStatus(article: Article): "draft" | "generating" | "failed" | "ready" {
  if (article.status === "generating") return "generating";
  if (article.status === "failed") return "failed";
  if (article.status === "ready") return "ready";
  return "draft";
}

export function draftLabel(article: Article): string {
  if (article.title && article.title.trim()) return article.title.trim();
  if (article.keywords && article.keywords.length > 0) return article.keywords[0];
  return "Untitled";
}

export function relativeTime(iso: string | Date): string {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
