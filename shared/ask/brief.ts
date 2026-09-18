// Business brief (business-context.md Business brief tab). One always-
// editable form, not Trakkr's three-button "Use this brief / Edit first /
// Dismiss" review card - the owner's own reference screenshot shows a
// single form with "Save brief" / "Cancel" and no review buttons, and the
// teardown's I7 already flags that Trakkr's own S6 never shows a Save
// button either (it only appears once you're past the review step). One
// form for both "reviewing a website draft" and "editing later" removes
// that whole state without losing the substance of Trakkr's rule: a
// website-sourced value never touches `brands` until Save brief runs
// (server/ask/briefStorage.ts).
import { z } from "zod";

// One source citation per website-derived field - screenshot's "Website
// sources" disclosure: a page title, a quote, and the URL. Only attached to
// a field when the quote was verified as a literal substring of the fetched
// page (server/ask/briefWebsiteDraft.ts) - an unverifiable quote means the
// field itself is dropped, not shown with a fabricated source.
export const askBriefSourceSchema = z.object({
  field: z.enum(["productsServices", "marketsAudiences"]),
  url: z.string(),
  title: z.string(),
  quote: z.string(),
});
export type AskBriefSource = z.infer<typeof askBriefSourceSchema>;

export const ASK_BRIEF_STATUSES = ["draft", "accepted", "dismissed"] as const;
export type AskBriefStatus = (typeof ASK_BRIEF_STATUSES)[number];

export const ASK_BRIEF_SCRAPE_STATUSES = ["none", "running", "ready", "failed"] as const;
export type AskBriefScrapeStatus = (typeof ASK_BRIEF_SCRAPE_STATUSES)[number];

// PUT /api/ask/brief body. `brandUpdatedAt` is the optimistic-concurrency
// token (server/routes/ask.ts): the client echoes back the `brands.updatedAt`
// it last read, and the server rejects with 409 if the brand row has moved
// since - the settings page and this tab both write `brands.description`/
// `targetAudience`, so a save here must not silently clobber an edit made
// there a moment before.
export const saveAskBriefSchema = z.object({
  brandId: z.string().min(1),
  brandUpdatedAt: z.string(),
  goals: z.string().trim().max(4000).optional().default(""),
  productsServices: z.string().trim().max(4000).optional().default(""),
  marketsAudiences: z.string().trim().max(4000).optional().default(""),
  currentPriorities: z.string().trim().max(4000).optional().default(""),
  peopleCapacity: z.string().trim().max(4000).optional().default(""),
  constraints: z.string().trim().max(4000).optional().default(""),
});
export type SaveAskBriefInput = z.infer<typeof saveAskBriefSchema>;

// GET /api/ask/brief response shape. productsServices/marketsAudiences come
// from `brands` (source of truth) once accepted, or from the unsaved draft
// columns before that - server/ask/briefStorage.ts's readBrief resolves
// which.
export type AskBriefView = {
  status: AskBriefStatus;
  scrapeStatus: AskBriefScrapeStatus;
  goals: string;
  productsServices: string;
  marketsAudiences: string;
  currentPriorities: string;
  peopleCapacity: string;
  constraints: string;
  sources: AskBriefSource[];
  brandUpdatedAt: string; // for the next save's optimistic-concurrency token
  acceptedAt: string | null;
  hasAnyContent: boolean; // drives AskEmptyState's "brief is ready" row and the drawer's summary line
};
