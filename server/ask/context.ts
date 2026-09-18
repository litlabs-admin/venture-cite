// Layered context assembly (04-implementation-plan.md §2.6). Later layers
// override earlier ones. Two rules enforced from day one even though layers
// 7-9 (memory/preferences) don't exist yet:
//
//   - Explicit beats inferred, unconditionally (simpler than Trakkr's
//     "older" qualifier - 01-trakkr-teardown.md §5).
//   - Private layers never leave the user - assembleShared() is the only
//     function that feeds the model; there is no assemblePersonal() yet
//     because there is nothing private to assemble, but the seam exists so
//     adding one later cannot accidentally widen what a shared export sees.
import type { Brand, BrandPrompt, Competitor } from "@shared/schema";
import { storage } from "../storage";
import { loadBrandGenerationContext, renderFactsBlock } from "../lib/brandGenerationContext";
import { getDashboardHero } from "../services/dashboardVisibility";
import { ASK_IDENTITY } from "./prompt";
import { readAcceptedBriefLayers } from "./briefStorage";
import { listActiveMemoriesForContext } from "./memoryStorage";
import { readPreferences } from "./preferencesStorage";
import { ASK_ANSWER_LENGTH_LABELS, ASK_PREFERENCE_TONE_LABELS } from "@shared/ask/preferences";
import { ASK_MEMORY_TYPE_LABELS, type AskMemoryType } from "@shared/ask/memory";

export type AskRunContext = {
  systemPrompt: string;
  coreCompetitors: Competitor[];
  // Ids only - buildReadPageAllowlist below is the only reader, and it only
  // ever needs the id. Keeping this a string[] instead of BrandPrompt[]
  // means server/ask/loop.ts (which threads this through, unchanged, into
  // a lazily-computed allowlist) doesn't need to import BrandPrompt too.
  trackedPromptIds: string[];
  // Already paid for while assembling the "# Current measurement state"
  // layer below - handed to the loop so it can seed the per-run memo
  // (tools/types.ts's RunMemo) and get_visibility can reuse it instead of
  // re-querying the same all-time hero a second time.
  hero: Awaited<ReturnType<typeof getDashboardHero>>;
};

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const withScheme = url.startsWith("http") ? url : `https://${url}`;
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Domains the run's read_page tool is allowed to fetch from - the brand's
// own site, its declared competitors, and any host already cited in this
// brand's geo_rankings (04 §3.3, round-2 decision 4).
//
// Called LAZILY by the loop (server/ask/loop.ts, via RunMemo), not from
// assembleAskContext - most runs never call read_page at all, and the
// citing-hosts query behind this is real database work (measured: ~2.7s
// selecting full geo_rankings rows before the `select distinct` rewrite
// below; still real work, just cheap, so it should only ever run for a
// turn that actually needs it).
export async function buildReadPageAllowlist(
  brand: Brand,
  coreCompetitors: Competitor[],
  trackedPromptIds: string[],
): Promise<Set<string>> {
  const hosts = new Set<string>();
  const ownHost = hostOf(brand.website);
  if (ownHost) hosts.add(ownHost);
  for (const c of coreCompetitors) {
    const h = hostOf(c.domain);
    if (h) hosts.add(h);
  }
  // Cited hosts: every citingOutletUrl this brand's tracked prompts have
  // accumulated. cracklepr.com was itself a Trakkr-cited host in the
  // round-2 evidence (01-trakkr-teardown.md R4), so "already cited" is
  // exactly the class of external page a useful Ask answer needs to read.
  //
  // `select distinct citing_outlet_url`, not the full row - the caller only
  // needs the host.
  try {
    if (trackedPromptIds.length > 0) {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const citedUrls = await storage.getDistinctCitingOutletUrls(trackedPromptIds, since);
      for (const url of citedUrls) {
        const h = hostOf(url);
        if (h) hosts.add(h);
      }
    }
  } catch {
    // Non-fatal: an empty extra-hosts set just means read_page is limited
    // to the brand + competitor domains for this run.
  }
  return hosts;
}

// Today's date, in words - resolves a question like "this week" or "since
// Monday" against a real calendar date instead of leaving the model to
// guess one from its training cutoff. UTC, matching every other timestamp
// this file already renders with `.toISOString()`.
function renderTodayLine(): string {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const date = now.toISOString().slice(0, 10);
  return `# Today\n${weekday}, ${date} (UTC)`;
}

// Up to 20 tracked prompt texts - what "our AI visibility" concretely means
// for this brand: the exact questions it is measured on. Without this layer
// a one-word question like "monitor" or "prompts" had nothing brand-specific
// to anchor to beyond the brief; with it, the model can name which tracked
// prompts a claim is about instead of speaking in generalities.
function renderTrackedPromptsBlock(prompts: BrandPrompt[]): string {
  if (prompts.length === 0) return "";
  const shown = prompts.slice(0, 20);
  const lines = shown.map((p) => `- ${p.prompt}`).join("\n");
  const overflow = prompts.length - shown.length;
  return `# Tracked prompts (the questions this brand is measured on)\n${lines}${
    overflow > 0 ? `\n...and ${overflow} more` : ""
  }`;
}

// Layer 4b: the business brief's fields with no home on `brands` - goals,
// current priorities, people/capacity, constraints. Only rendered once the
// brief is ACCEPTED (readAcceptedBriefLayers returns null for a draft or a
// brand with none), matching the "stays separate until you choose Save
// brief" rule already enforced by briefStorage.ts's own read path.
//
// "Explicit beats inferred, unconditionally" (04-implementation-plan.md
// §3.6): these are the brand's OWN stated constraints, so they are framed as
// authoritative and placed to outrank the shared-memory layer that follows
// it, not just by prompt order but by the words used ("The brand has stated
// these directly" vs memory's "may be outdated").
function renderBriefLayer(
  layers: {
    goals: string | null;
    currentPriorities: string | null;
    peopleCapacity: string | null;
    constraints: string | null;
  } | null,
): string {
  if (!layers) return "";
  const lines = [
    layers.goals ? `Goals: ${layers.goals}` : null,
    layers.currentPriorities ? `Current priorities: ${layers.currentPriorities}` : null,
    layers.peopleCapacity ? `People and capacity: ${layers.peopleCapacity}` : null,
    layers.constraints ? `Constraints (always respect these): ${layers.constraints}` : null,
  ].filter(Boolean);
  if (lines.length === 0) return "";
  return `# Business brief - stated directly by the brand's own team (authoritative; this outranks anything in Shared memory below)\n${lines.join("\n")}`;
}

// Layer 7: shared brand memory (business-context.md Memory tab). Ordered
// oldest-to-newest is fine here - there is no ranking yet, and the layer's
// own framing already tells the model these are lower-priority than an
// explicit brief constraint above.
function renderMemoryLayer(memories: Array<{ type: AskMemoryType; content: string }>): string {
  if (memories.length === 0) return "";
  const lines = memories
    .map((m) => `- (${ASK_MEMORY_TYPE_LABELS[m.type]}) ${m.content}`)
    .join("\n");
  return `# Shared memory - facts the team has saved or the Agent has learned from past conversations. Useful context, but a stated Business brief constraint always wins over one of these if they conflict\n${lines}`;
}

function renderMeasurementState(hero: Awaited<ReturnType<typeof getDashboardHero>>): string {
  if (hero.totalChecks === 0) {
    return "No completed citation-check runs yet. Do not state a visibility score or citation rate - say measurement has not started.";
  }
  return [
    `Visibility score: ${hero.visibilityScore}/100`,
    `Citation rate: ${hero.citationRate}% (${hero.citedChecks}/${hero.totalChecks} checks)`,
    hero.lastScanAt ? `Last measured: ${hero.lastScanAt.toISOString()}` : "Last measured: unknown",
  ].join("\n");
}

export async function assembleAskContext(brand: Brand): Promise<AskRunContext> {
  const [genContext, coreCompetitors, hero, trackedPrompts, briefLayers, memories] =
    await Promise.all([
      loadBrandGenerationContext(brand.id),
      storage.getCompetitors(brand.id, { tier: "core" }),
      getDashboardHero(brand, null),
      storage.getBrandPromptsByBrandId(brand.id).catch(() => [] as BrandPrompt[]),
      readAcceptedBriefLayers(brand.id).catch(() => null),
      listActiveMemoriesForContext(brand.id).catch(() => []),
    ]);

  const factsBlock = genContext ? renderFactsBlock(genContext.facts) : "";

  const briefLines = [
    brand.description ? `Products/services: ${brand.description}` : null,
    brand.targetAudience ? `Target audience: ${brand.targetAudience}` : null,
    brand.products && brand.products.length > 0 ? `Products: ${brand.products.join(", ")}` : null,
    brand.keyValues && brand.keyValues.length > 0
      ? `Key values: ${brand.keyValues.join(", ")}`
      : null,
    brand.uniqueSellingPoints && brand.uniqueSellingPoints.length > 0
      ? `Unique selling points: ${brand.uniqueSellingPoints.join(", ")}`
      : null,
  ].filter(Boolean);

  const competitorLines =
    coreCompetitors.length > 0
      ? coreCompetitors.map((c) => `- ${c.name} (${c.domain})`).join("\n")
      : "No competitors declared yet.";

  const systemPrompt = [
    ASK_IDENTITY, // layer 1
    renderTodayLine(), // layer 1b - resolves "this week"/"since Monday" against a real date
    `# Brand\nName: ${brand.name}\nIndustry: ${brand.industry}\nWebsite: ${brand.website ?? "(not set)"}`, // layer 2
    factsBlock ? `# Verified facts\n${factsBlock}` : "", // layer 3
    briefLines.length > 0 ? `# Business brief\n${briefLines.join("\n")}` : "", // layer 4
    `# Declared competitors (the brand's own stated rivals - treat this as ground truth for "who do we compete with", separate from whichever names AI engines happen to cite)\n${competitorLines}`, // layer 5
    renderTrackedPromptsBlock(trackedPrompts), // layer 5b
    `# Current measurement state\n${renderMeasurementState(hero)}`, // layer 6
    renderBriefLayer(briefLayers), // layer 4b - goals/priorities/capacity/constraints, accepted only
    renderMemoryLayer(memories), // layer 7 - shared memory
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt,
    coreCompetitors,
    trackedPromptIds: trackedPrompts.map((p) => p.id),
    hero,
  };
}

// Layers 8-9: PERSONAL context - private user preferences and a per-thread
// "Just for one conversation" override. Deliberately NOT part of
// assembleAskContext above: that function is the one that would ever feed a
// SHARED export (a future handoff, a teammate-visible summary), and rule 5
// in 01-trakkr-teardown.md §5 ("private layers never leave the user") is
// enforced here as a function boundary, not a runtime check someone has to
// remember. server/routes/ask.ts calls this SEPARATELY and appends its
// result to assembleAskContext's systemPrompt only for the one user running
// the one turn - never returned to, or read by, anything else.
//
// "Preferences govern form, not facts" (01 §5 rule 3): the wording below
// asks the model to change HOW it writes, never to treat a preference as new
// information about the brand.
export async function assemblePersonalContextBlock(
  userId: string,
  temporaryInstructions: string | null,
): Promise<string> {
  const prefs = await readPreferences(userId).catch(() => null);
  const parts: string[] = [];

  if (prefs && (prefs.tone || prefs.language || prefs.answerLength)) {
    const lines = [
      prefs.tone ? `Tone: ${ASK_PREFERENCE_TONE_LABELS[prefs.tone]}` : null,
      prefs.language ? `Answer in: ${prefs.language}` : null,
      prefs.answerLength ? `Answer length: ${ASK_ANSWER_LENGTH_LABELS[prefs.answerLength]}` : null,
    ].filter(Boolean);
    parts.push(
      `# This user's answer preferences (private to them - change ONLY how you write, never what you claim)\n${lines.join("\n")}`,
    );
  }

  if (temporaryInstructions && temporaryInstructions.trim().length > 0) {
    parts.push(
      `# Temporary instructions for this conversation only (set once at thread start; never remember this beyond this thread)\n${temporaryInstructions.trim()}`,
    );
  }

  return parts.join("\n\n");
}
