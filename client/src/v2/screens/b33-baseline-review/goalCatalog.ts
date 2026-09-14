/**
 * The four goals a brand can choose on board 33.
 *
 * Mirrors `server/routes/brandGoals.ts`'s `GOAL_CATALOG` by key and title -
 * the server is the source of truth for the saved `title`/`statement`
 * (it fills in the real brand name), this list only needs to match well
 * enough that the card a viewer clicks describes what gets saved.
 */
export type GoalKey =
  "accurate_visibility" | "earn_citations" | "increase_inquiries" | "correct_descriptions";

export type GoalCatalogEntry = {
  key: GoalKey;
  title: string;
  description: string;
};

export const GOAL_CATALOG: readonly GoalCatalogEntry[] = [
  {
    key: "accurate_visibility",
    title: "Improve accurate visibility",
    description: "Help more buyers see and understand the brand correctly.",
  },
  {
    key: "earn_citations",
    title: "Earn more citations",
    description: "Increase the number of AI answers that cite the brand's own content.",
  },
  {
    key: "increase_inquiries",
    title: "Increase qualified inquiries",
    description: "Drive more high-intent interest from relevant buyers.",
  },
  {
    key: "correct_descriptions",
    title: "Correct wrong descriptions",
    description: "Fix inaccurate or misleading information about the brand.",
  },
];
