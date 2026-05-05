import type { MentionPlatform } from "./canonicalUrl";

type RedditInputs = { ups: number; comments: number };
type HNInputs = { points: number; comments: number };

export function normalizeEngagement(
  platform: MentionPlatform,
  raw: RedditInputs | HNInputs | object,
): number | null {
  if (platform === "reddit") {
    const { ups = 0, comments = 0 } = raw as RedditInputs;
    const score = Math.log10(Math.max(0, ups) + Math.max(0, comments) * 2 + 1) * 25;
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  if (platform === "hackernews") {
    const { points = 0, comments = 0 } = raw as HNInputs;
    const score = Math.log10(Math.max(0, points) + Math.max(0, comments) + 1) * 30;
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  return null; // Quora has no engagement data we can read
}
