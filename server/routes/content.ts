// Content generation + drafts routes (Wave 5.1).
//
// Extracted from server/routes.ts as part of the per-domain split. Covers
// the content-authoring surface: persistent drafts, background generation
// jobs, AI-detection scoring, rewrite/humanization, keyword suggestions,
// popular topics, and the keyword-research workflow.
//
// Routes:
//   GET    /api/content-drafts                     — list drafts (owner-scoped)
//   POST   /api/content-drafts                     — create a draft
//   GET    /api/content-drafts/:id                 — single draft
//   PATCH  /api/content-drafts/:id                 — auto-save partial update
//   DELETE /api/content-drafts/:id                 — delete draft
//   POST   /api/generate-content                   — enqueue generation job
//   GET    /api/content-jobs/active                — current/most-recent job for resume
//   GET    /api/content-jobs/:jobId                — poll job status
//   POST   /api/analyze-content                    — AI-detection score
//   POST   /api/rewrite-content                    — humanize + optional persist
//   POST   /api/keyword-suggestions                — keyword brainstorm
//   GET    /api/popular-topics                     — trending topics by industry
//   POST   /api/keyword-research/discover          — AI keyword discovery
//   GET    /api/keyword-research/:brandId          — list research rows
//   GET    /api/keyword-research/:brandId/opportunities — top opportunities
//   PATCH  /api/keyword-research/:id               — update row
//   DELETE /api/keyword-research/:id               — delete row

import type { Express } from "express";
import { storage } from "../storage";
import { MODELS } from "../lib/modelConfig";
import { type GenerationPayload } from "../contentGenerationWorker";
import {
  requireUser,
  requireBrand,
  requireArticle,
  requireKeywordResearch,
  pickFields,
} from "../lib/ownership";
import { withArticleQuota, isUsageLimitError } from "../lib/usageLimit";
import type { Tier } from "../lib/llmPricing";
import {
  openai,
  aiLimitMiddleware,
  sendError,
  safeParseJson,
  MAX_CONTENT_LENGTH,
} from "../lib/routesShared";

export function setupContentRoutes(app: Express): void {
  // Helper function to humanize content while keeping it professional.
  // Tokens are roughly 0.75 words; we cap `max_tokens` to ~1.5× the input
  // token count (capped at 4500) so a 200-word article doesn't spend the
  // full 4500-token budget three times over.
  async function humanizeContent(
    content: string,
    industry: string,
    maxAttempts: number = 3,
    baselineScore?: number,
  ): Promise<{
    humanizedContent: string;
    humanScore: number;
    attempts: number;
    issues: string[];
    strengths: string[];
  }> {
    let currentContent = content;
    let humanScore = 0;
    let attempts = 0;
    let issues: string[] = [];
    let strengths: string[] = [];

    // Start bestScore at the baseline so rewrites must beat the current score.
    // This prevents auto-improve from returning worse content than the original.
    let bestContent = content;
    let bestScore = baselineScore ?? 0;
    let bestIssues: string[] = [];
    let bestStrengths: string[] = [];

    // Tight upper bound on per-call tokens based on input size.
    const inputTokens = Math.ceil(content.length / 3.5);
    const perCallMaxTokens = Math.min(4500, Math.max(500, Math.ceil(inputTokens * 1.5)));

    const humanizationPassPrompts = [
      `You are a seasoned ${industry} journalist and editor with 15+ years of experience writing for top publications. Your job is to completely rewrite AI-generated text so it reads as if YOU wrote it from scratch.

REWRITING RULES — follow these strictly:
1. COMPLETELY restructure paragraphs — don't just swap words, reorganize the flow of ideas
2. Mix sentence lengths aggressively: some as short as 3 words ("That matters."), others spanning 30+ words with subordinate clauses
3. Start sentences with varied structures: prepositional phrases, gerunds, dependent clauses, questions, single-word interjections ("Look,", "Sure,", "Right.")
4. Use REAL contractions everywhere — "it's", "don't", "won't", "they're", "that's", "here's", "we've"
5. Drop in first-person observations: "I've seen this play out many times", "from what I've observed", "in my experience working with"
6. Include imperfect human touches: mid-sentence course corrections with dashes — like this, occasional fragment sentences, and rhetorical asides
7. Reference specific but plausible anecdotes, dates, or named examples ("Back in 2022, a mid-size SaaS company I worked with...")
8. Avoid these AI tells at ALL costs: "In today's [anything]", "In the ever-evolving", "It's important to note", "It's worth noting", "landscape", "leverage", "harness", "delve", "tapestry", "Moreover", "Furthermore", "In conclusion", "crucial", "comprehensive", "Navigating the", "realm"
9. Use colloquial transitions: "Thing is,", "Here's what most people miss:", "The kicker?", "So what does this actually mean?", "Let's break this down."
10. Vary tone within the piece — mix authoritative statements with conversational asides and occasional humor
11. Add specificity: replace vague claims with concrete numbers, timeframes, or examples
12. Use the Oxford comma inconsistently (like real humans do)
13. Occasionally start sentences with "And" or "But" — real writers do this all the time
14. Include a genuine opinion or mild disagreement with conventional wisdom somewhere

OUTPUT: Return ONLY the rewritten content in markdown format. Do NOT add any meta-commentary about what you changed.`,

      `You are a meticulous copy editor who specializes in making text sound authentically human. Review this draft and make targeted improvements:

SPECIFIC FIXES TO APPLY:
1. Find any remaining "AI-sounding" phrases and replace them with natural alternatives:
   - "It is important to" → just state the point directly
   - "This enables/allows" → "This lets" or rephrase entirely
   - "In order to" → "to"
   - "plays a crucial role" → describe the actual impact instead
   - "a wide range of" → "plenty of" or be specific
   - Any sentence starting with "This [noun] is" — restructure it
2. Check for monotonous rhythm — if 3+ consecutive sentences have similar length/structure, break the pattern
3. Ensure at least 2-3 sentences start with dependent clauses ("When you think about it,", "If there's one thing I've learned,", "Despite what the textbooks say,")
4. Add 1-2 mild hedging phrases that humans use: "probably", "tends to", "in most cases", "generally speaking"
5. Make sure contractions are used at least 80% of the time where possible
6. Check that no paragraph follows an identical structure to the previous one
7. Ensure the piece has at least one dash — used for emphasis or aside — and at least one parenthetical (like this)

OUTPUT: Return ONLY the improved content in markdown format.`,

      `You are performing a final human-authenticity pass on this content. Make surgical edits:

FINAL PASS CHECKLIST:
1. Read aloud mentally — flag anything that sounds "written by committee" and make it sound like one person talking
2. Ensure the opening doesn't use any cliché AI opener (no "In today's...", no "In an era of...", no "[Topic] has become increasingly...")
3. Verify sentence starters across the ENTIRE piece — no two consecutive sentences should start with the same word or structure
4. Add 1-2 instances of informal emphasis: italics for *stress*, or a short emphatic sentence by itself
5. Check that specific examples feel lived-in, not generically educational
6. Ensure transitions between sections feel natural, not formulaic
7. The conclusion should NOT start with "In conclusion" — end with a forward-looking thought, a question, or a punchy takeaway
8. Double-check for any remaining AI vocabulary: "landscape", "leverage", "harness", "delve", "crucial", "comprehensive", "robust", "innovative", "cutting-edge", "game-changer", "empower" — replace ALL of these

OUTPUT: Return ONLY the final content in markdown format.`,
    ];

    for (let i = 0; i < Math.min(maxAttempts, humanizationPassPrompts.length); i++) {
      attempts++;

      const humanizeResponse = await openai.chat.completions.create({
        model: MODELS.contentHumanize,
        messages: [
          { role: "system", content: humanizationPassPrompts[i] },
          {
            role: "user",
            content: `Rewrite this content to sound naturally human-written. Maintain all information, structure, and markdown formatting:\n\n${currentContent}`,
          },
        ],
        max_tokens: perCallMaxTokens,
        temperature: 1.0,
      });

      currentContent = humanizeResponse.choices[0].message.content || currentContent;

      // Use a strict, adversarial scorer (separate model call to avoid self-bias)
      const analysisResponse = await openai.chat.completions.create({
        model: MODELS.contentAnalyze,
        messages: [
          {
            role: "system",
            content: `You are a strict AI detection analyst. Your job is to be HARSH and CRITICAL — score text as AI detection tools like GPTZero, Originality.ai, and Copyleaks actually would. Most AI-rewritten text scores 40-65 at best. Only genuinely human-sounding text scores above 75.

SCORING CRITERIA (be strict):
- Sentence length variance: Measure standard deviation. If most sentences are 15-25 words, that's AI-like. Score LOW.
- Vocabulary: Any use of "landscape", "leverage", "harness", "delve", "moreover", "furthermore", "crucial", "comprehensive", "robust", "innovative" = immediate 10-point penalty each
- Opening line: If it starts with "In today's..." or "In an era..." = score below 40 automatically
- Transition words: If every paragraph starts with a transition word, that's AI. Score LOW.
- Contractions: If fewer than 60% of possible contractions are used, score LOW.
- First-person voice: Absence of any personal voice or opinion = score LOW.
- Repetitive structure: Same sentence pattern more than twice = score LOW.
- Burstiness: Human writing has HIGH burstiness (mix of very short and very long sentences). AI has LOW burstiness. Measure this.

Return ONLY a JSON object:
{
  "score": <number 0-100, be harsh>,
  "issues": [<specific AI-like patterns found, max 5>],
  "strengths": [<genuinely human-like qualities, max 5>],
  "burstiness": <"low"|"medium"|"high">,
  "ai_vocabulary_found": [<list of AI buzzwords still present>]
}`,
          },
          {
            role: "user",
            content: `Analyze this text strictly for AI detection. Be harsh. Return only valid JSON:\n\n${currentContent.substring(0, 4000)}`,
          },
        ],
        max_tokens: 600,
        temperature: 0.3,
      });

      const analysis = safeParseJson<any>(analysisResponse.choices[0].message.content) ?? {
        score: 40,
      };
      humanScore = typeof analysis.score === "number" ? analysis.score : 40;
      issues = Array.isArray(analysis.issues) ? [...analysis.issues] : [];
      if (Array.isArray(analysis.ai_vocabulary_found) && analysis.ai_vocabulary_found.length > 0) {
        issues.push(`AI vocabulary still present: ${analysis.ai_vocabulary_found.join(", ")}`);
      }
      strengths = Array.isArray(analysis.strengths) ? analysis.strengths : [];

      // Promote to best only if this pass improved the score.
      if (humanScore > bestScore) {
        bestScore = humanScore;
        bestContent = currentContent;
        bestIssues = [...issues];
        bestStrengths = [...strengths];
      }

      if (humanScore >= 80) break;
    }

    // Return the highest-scoring version seen across all passes, not
    // necessarily the final pass (which may have regressed).
    return {
      humanizedContent: bestContent,
      humanScore: bestScore,
      attempts,
      issues: bestIssues,
      strengths: bestStrengths,
    };
  }

  // ── Content Draft CRUD ─────────────────────────────────────────────────────
  // Drafts persist form state across navigations and enable multiple concurrent
  // drafts per user. Auto-saved from the client on field change (debounced).

  // List all drafts for the authenticated user (newest-first).
  app.get("/api/content-drafts", async (req, res) => {
    try {
      const user = requireUser(req);
      const drafts = await storage.getContentDraftsByUserId(user.id);
      res.json({ success: true, data: drafts });
    } catch (error) {
      sendError(res, error, "Failed to fetch content drafts");
    }
  });

  // Create a new draft.
  app.post("/api/content-drafts", async (req, res) => {
    try {
      const user = requireUser(req);
      const { keywords, industry, type, brandId, targetCustomers, geography, contentStyle, title } =
        req.body ?? {};
      const draft = await storage.createContentDraft(user.id, {
        keywords: keywords ?? "",
        industry: industry ?? "",
        type: type ?? "article",
        brandId: brandId ?? null,
        targetCustomers: targetCustomers ?? null,
        geography: geography ?? null,
        contentStyle: contentStyle ?? "b2c",
        title: title ?? null,
      });
      res.json({ success: true, data: draft });
    } catch (error) {
      sendError(res, error, "Failed to create content draft");
    }
  });

  // Get a single draft by id (owner-scoped).
  app.get("/api/content-drafts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const draft = await storage.getContentDraftById(req.params.id, user.id);
      if (!draft) return res.status(404).json({ success: false, error: "Draft not found" });
      res.json({ success: true, data: draft });
    } catch (error) {
      sendError(res, error, "Failed to fetch content draft");
    }
  });

  // Auto-save: update an existing draft (partial fields allowed).
  app.patch("/api/content-drafts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      const {
        keywords,
        industry,
        type,
        brandId,
        targetCustomers,
        geography,
        contentStyle,
        title,
        generatedContent,
        articleId,
        jobId,
        humanScore,
        passesAiDetection,
      } = req.body ?? {};
      const update: Record<string, any> = {};
      if (keywords !== undefined) update.keywords = keywords;
      if (industry !== undefined) update.industry = industry;
      if (type !== undefined) update.type = type;
      if (brandId !== undefined) update.brandId = brandId;
      if (targetCustomers !== undefined) update.targetCustomers = targetCustomers;
      if (geography !== undefined) update.geography = geography;
      if (contentStyle !== undefined) update.contentStyle = contentStyle;
      if (title !== undefined) update.title = title;
      if (generatedContent !== undefined) update.generatedContent = generatedContent;
      if (articleId !== undefined) update.articleId = articleId;
      if (jobId !== undefined) update.jobId = jobId;
      if (humanScore !== undefined) update.humanScore = humanScore;
      if (passesAiDetection !== undefined) update.passesAiDetection = passesAiDetection;
      const draft = await storage.updateContentDraft(req.params.id, user.id, update);
      if (!draft) return res.status(404).json({ success: false, error: "Draft not found" });
      res.json({ success: true, data: draft });
    } catch (error) {
      sendError(res, error, "Failed to update content draft");
    }
  });

  // Delete a draft (owner-scoped).
  app.delete("/api/content-drafts/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await storage.deleteContentDraft(req.params.id, user.id);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete content draft");
    }
  });

  // ── Content Generation ─────────────────────────────────────────────────────

  // Generate content — enqueues a background job so long-running GPT calls
  // survive page navigation, logout, and browser refresh. Returns the job
  // id immediately; client polls GET /api/content-jobs/:jobId for status.
  app.post("/api/generate-content", aiLimitMiddleware, async (req, res) => {
    const {
      keywords,
      industry,
      type,
      brandId,
      humanize = true,
      targetCustomers,
      geography,
      contentStyle = "b2c",
      draftId,
    } = req.body ?? {};

    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    if (!keywords || !industry || !type) {
      return res
        .status(400)
        .json({ success: false, error: "keywords, industry, and type are required" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "Content generation is not available. OpenAI API key is not configured.",
      });
    }

    try {
      if (brandId) {
        await requireBrand(brandId, user.id);
      }
      const payload: GenerationPayload = {
        keywords,
        industry,
        type,
        brandId,
        humanize,
        targetCustomers,
        geography,
        contentStyle,
      };

      // Wave 4.2: atomic check + insert + counter increment. The
      // helper opens a transaction, locks the user row with FOR UPDATE,
      // re-reads the counter, throws UsageLimitError if at cap, runs
      // the closure (insert the job), then bumps the counter — all in
      // one commit. Two concurrent requests can no longer race past
      // the cap. UsageLimitError is caught below and surfaced as 403.
      const tier = (user.accessTier || "free") as Tier;
      const schema = await import("@shared/schema");
      const jobId = await withArticleQuota(user.id, tier, async (tx) => {
        const [row] = await tx
          .insert(schema.contentGenerationJobs)
          .values({
            userId: user.id,
            brandId: brandId || null,
            status: "pending",
            requestPayload: payload as never,
          })
          .returning();
        return row.id;
      });

      // Link the job to the active draft so the worker can update it on completion.
      if (draftId && typeof draftId === "string") {
        await storage.updateContentDraft(draftId, user.id, { jobId });
      }

      return res.json({
        success: true,
        data: { jobId, status: "pending" },
      });
    } catch (error) {
      if (isUsageLimitError(error)) {
        return res.status(403).json({
          success: false,
          error: error.message,
          limitReached: true,
          remaining: 0,
        });
      }
      return sendError(res, error, "Failed to enqueue content generation job");
    }
  });

  // Poll a content generation job (owner-scoped).
  // Return the user's active (in-progress) or most recent completed job
  // so the content page can resume where the user left off.
  app.get("/api/content-jobs/active", async (req, res) => {
    try {
      const user = requireUser(req);
      const active = await storage.getActiveContentJob(user.id);
      if (active) {
        return res.json({ success: true, data: { ...active, type: "active" } });
      }
      const recent = await storage.getRecentCompletedContentJob(user.id);
      if (recent) {
        return res.json({ success: true, data: { ...recent, type: "completed" } });
      }
      res.json({ success: true, data: null });
    } catch (error) {
      sendError(res, error, "Failed to fetch active job");
    }
  });

  app.get("/api/content-jobs/:jobId", async (req, res) => {
    try {
      const user = requireUser(req);
      const job = await storage.getContentJobById(req.params.jobId, user.id);
      if (!job) return res.status(404).json({ success: false, error: "Job not found" });
      res.json({
        success: true,
        data: {
          id: job.id,
          status: job.status,
          articleId: job.articleId,
          errorMessage: job.errorMessage,
          requestPayload: job.requestPayload,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
        },
      });
    } catch (error) {
      sendError(res, error, "Failed to fetch job");
    }
  });

  // Analyze content for AI detection score
  app.post("/api/analyze-content", aiLimitMiddleware, async (req, res) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const { content } = req.body;

    if (!content || typeof content !== "string") {
      return res.status(400).json({ success: false, error: "Content is required" });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return res
        .status(413)
        .json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "AI detection analysis is not available. OpenAI API key is not configured.",
        message: "Please contact support to enable content analysis.",
      });
    }

    try {
      const analysisResponse = await openai.chat.completions.create({
        model: MODELS.contentAnalyze,
        messages: [
          {
            role: "system",
            content: `You are a strict AI detection analyst simulating tools like GPTZero, Originality.ai, and Copyleaks. Be HARSH and realistic — most AI-rewritten text scores 40-65. Only genuinely human text scores above 75.

SCORING CRITERIA (be strict):
- Sentence length variance: If most sentences are 15-25 words with similar structure, that's AI-like. Score LOW.
- Vocabulary: Any use of "landscape", "leverage", "harness", "delve", "moreover", "furthermore", "crucial", "comprehensive", "robust", "innovative", "tapestry", "realm" = immediate penalty
- Opening line: "In today's..." or "In an era..." = score below 40
- Contractions: If fewer than 60% of possible contractions are used, score LOW
- First-person voice: No personal voice = score LOW
- Burstiness: Human writing mixes very short and very long sentences. AI is uniform. Measure this.
- Repetitive structure: Same sentence pattern repeated = score LOW

Return a JSON object with:
- score: 0-100 (be harsh and realistic)
- issues: array of specific AI-like patterns found (max 5)
- strengths: array of human-like qualities found (max 5)
- recommendation: single string with the main improvement suggestion
- ai_vocabulary_found: array of AI buzzwords still present`,
          },
          {
            role: "user",
            content: `Analyze this content strictly for AI detection. Be harsh and realistic:\n\n${content.substring(0, 4000)}`,
          },
        ],
        max_tokens: 600,
        temperature: 0.3,
      });

      const analysisText = analysisResponse.choices[0].message.content || "{}";
      let analysis;

      try {
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        analysis = JSON.parse(jsonMatch ? jsonMatch[0] : analysisText);
      } catch {
        analysis = {
          score: 45,
          issues: ["Unable to parse detailed analysis"],
          strengths: ["Content appears structured"],
          recommendation: "Consider adding more varied sentence structures and personal voice",
        };
      }

      res.json({
        success: true,
        ...analysis,
        passesAiDetection: (analysis.score || 0) >= 70,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: errorMessage });
    }
  });

  // Rewrite content to improve human score. When called with an articleId,
  // the improved version is persisted as a new draft article so the user can
  // compare or discard it from the Articles page — the original is never
  // touched. Without articleId, behaves as a pure transform (legacy shape).
  app.post("/api/rewrite-content", aiLimitMiddleware, async (req, res) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const { content, industry = "general", articleId, currentScore } = req.body;

    if (!content || typeof content !== "string") {
      return res.status(400).json({ success: false, error: "Content is required" });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return res
        .status(413)
        .json({ success: false, error: `Content exceeds ${MAX_CONTENT_LENGTH} characters` });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "Content rewriting is not available. OpenAI API key is not configured.",
      });
    }

    // Pass the current score as the baseline — the humanizer will only replace
    // content if a rewrite scores higher. This prevents the "auto-improve made
    // it worse" bug where all rewrites scored below the already-humanized content.
    const baselineScore = typeof currentScore === "number" ? currentScore : undefined;

    try {
      const result = await humanizeContent(content, industry, 3, baselineScore);
      const improved = result.humanScore > (baselineScore ?? 0);

      // If the user passed an articleId, persist the improved version as a
      // new draft article and tag its seoData so the UI can surface the
      // lineage ("Improved from <originalId>").
      let improvedArticleId: string | undefined;
      if (articleId && typeof articleId === "string") {
        const original = await requireArticle(articleId, user.id).catch(() => null);
        if (original) {
          const originalScore = (original.seoData as any)?.humanScore ?? null;
          const improvedTitle = `${original.title} (improved)`;
          const improvedSlug = `${original.slug}-improved-${Date.now().toString(36)}`;
          const newArticle = await storage.createArticle({
            brandId: original.brandId,
            title: improvedTitle,
            slug: improvedSlug,
            content: result.humanizedContent,
            industry: original.industry ?? industry,
            contentType: original.contentType,
            keywords: original.keywords,
            author: original.author ?? "GEO Platform",
            seoData: {
              humanScore: result.humanScore,
              humanizationAttempts: result.attempts,
              passesAiDetection: result.humanScore >= 70,
              improvedFrom: original.id,
              originalScore,
              improvedScore: result.humanScore,
            },
          } as any);
          improvedArticleId = newArticle.id;
        }
      }

      res.json({
        success: true,
        content: result.humanizedContent,
        humanScore: result.humanScore,
        attempts: result.attempts,
        passesAiDetection: result.humanScore >= 70,
        aiIssues: result.issues,
        aiStrengths: result.strengths,
        improvedArticleId,
        improved, // false when no rewrite beat the baseline
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: errorMessage });
    }
  });

  // Get keyword suggestions based on user input and industry
  app.post("/api/keyword-suggestions", aiLimitMiddleware, async (req, res) => {
    const { input, industry } = req.body;

    if (!input || input.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: [],
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "Keyword suggestions are not available. OpenAI API key is not configured.",
        message: "Please contact support to enable keyword suggestions.",
      });
    }

    try {
      const response = await openai.chat.completions.create({
        model: MODELS.keywordSuggestions,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a keyword research expert. Return a JSON object of the shape {"suggestions": ["keyword 1", "keyword 2", ...]} with 6-8 short keyword phrases relevant to the user's input and industry. Only output valid JSON, nothing else.`,
          },
          {
            role: "user",
            content: `Input: "${input}"\nIndustry: ${industry}\n\nReturn {"suggestions": [6-8 short keyword phrases]}`,
          },
        ],
        max_tokens: 300,
      });

      const rawContent = response.choices[0].message.content;
      const parsed = safeParseJson<{ suggestions?: unknown } | string[]>(rawContent);
      let suggestions: string[] = [];
      if (Array.isArray(parsed)) {
        // Some models (or test-mode stripping) return a bare array.
        suggestions = parsed.filter((s): s is string => typeof s === "string");
      } else if (parsed && Array.isArray((parsed as any).suggestions)) {
        suggestions = ((parsed as any).suggestions as unknown[]).filter(
          (s): s is string => typeof s === "string",
        );
      }

      res.json({
        success: true,
        suggestions: suggestions.slice(0, 8),
      });
    } catch (error) {
      console.error("Keyword suggestion error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({
        success: false,
        error: errorMessage,
        message: "Failed to generate keyword suggestions. Please try again.",
      });
    }
  });

  // Get popular topics based on industry and current trends
  app.get("/api/popular-topics", async (req, res) => {
    const { industry } = req.query;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "Popular topics feature is not available. OpenAI API key is not configured.",
        message: "Please contact support to enable trending topics.",
      });
    }

    try {
      const response = await openai.chat.completions.create({
        model: MODELS.popularTopics,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a trend analyst expert. Return a JSON object of the shape {"topics": [{"topic": "...", "description": "...", "category": "..."}, ...]} with 6-8 trending topics. Only output valid JSON, nothing else.`,
          },
          {
            role: "user",
            content: `Industry: ${industry}\n\nReturn {"topics": [6-8 current trending topics valuable for content creators in 2026]}.`,
          },
        ],
        max_tokens: 600,
      });

      const rawContent = response.choices[0].message.content;
      const parsed = safeParseJson<{ topics?: unknown } | unknown[]>(rawContent);
      let topics: any[] = [];
      if (Array.isArray(parsed)) {
        topics = parsed;
      } else if (parsed && Array.isArray((parsed as any).topics)) {
        topics = (parsed as any).topics;
      }

      if (topics.length === 0) {
        // Use curated fallback if AI fails
        const fallbackTopics = {
          Technology: [
            {
              topic: "AI and Machine Learning",
              description: "Latest developments in artificial intelligence",
              category: "Innovation",
            },
            {
              topic: "Cybersecurity Trends",
              description: "Protecting businesses from digital threats",
              category: "Security",
            },
            {
              topic: "Cloud Computing Solutions",
              description: "Scalable infrastructure for modern businesses",
              category: "Infrastructure",
            },
          ],
          Healthcare: [
            {
              topic: "Telemedicine Revolution",
              description: "Remote healthcare delivery and digital consultations",
              category: "Digital Health",
            },
            {
              topic: "Mental Health Awareness",
              description: "Breaking stigma and promoting wellbeing",
              category: "Wellness",
            },
            {
              topic: "Preventive Care Strategies",
              description: "Proactive health management and screening",
              category: "Prevention",
            },
          ],
          Finance: [
            {
              topic: "Digital Banking Evolution",
              description: "Online and mobile banking innovations",
              category: "Digital Services",
            },
            {
              topic: "Investment Strategies for 2025",
              description: "Portfolio optimization and market trends",
              category: "Investment",
            },
            {
              topic: "Cryptocurrency and DeFi",
              description: "Decentralized finance and digital currencies",
              category: "Innovation",
            },
          ],
          "E-commerce": [
            {
              topic: "Social Commerce Growth",
              description: "Selling directly through social media platforms",
              category: "Social Media",
            },
            {
              topic: "Sustainable E-commerce",
              description: "Eco-friendly practices and green logistics",
              category: "Sustainability",
            },
            {
              topic: "Mobile Commerce Optimization",
              description: "Improving mobile shopping experiences",
              category: "Mobile",
            },
          ],
        };

        topics = fallbackTopics[industry as keyof typeof fallbackTopics] || [
          {
            topic: "Industry Innovation",
            description: "Latest trends and developments",
            category: "General",
          },
        ];
      }

      res.json({
        success: true,
        topics: topics.slice(0, 8),
      });
    } catch (error) {
      console.error("Popular topics error:", error);
      // Return curated topics on error
      const fallbackTopics = {
        Technology: [
          {
            topic: "AI and Machine Learning",
            description: "Latest developments in artificial intelligence",
            category: "Innovation",
          },
          {
            topic: "Cybersecurity Trends",
            description: "Protecting businesses from digital threats",
            category: "Security",
          },
        ],
        Healthcare: [
          {
            topic: "Telemedicine Revolution",
            description: "Remote healthcare delivery",
            category: "Digital Health",
          },
          {
            topic: "Mental Health Awareness",
            description: "Breaking stigma and promoting wellbeing",
            category: "Wellness",
          },
        ],
        Finance: [
          {
            topic: "Digital Banking Evolution",
            description: "Online banking innovations",
            category: "Digital Services",
          },
          {
            topic: "Investment Strategies",
            description: "Portfolio optimization and trends",
            category: "Investment",
          },
        ],
        "E-commerce": [
          {
            topic: "Social Commerce Growth",
            description: "Selling through social media",
            category: "Social Media",
          },
          {
            topic: "Sustainable E-commerce",
            description: "Eco-friendly practices",
            category: "Sustainability",
          },
        ],
      };

      const topics = fallbackTopics[industry as keyof typeof fallbackTopics] || [
        { topic: "Industry Innovation", description: "Latest trends", category: "General" },
      ];

      res.json({
        success: true,
        topics: topics,
        fallback: true,
      });
    }
  });

  // ============ KEYWORD RESEARCH ENDPOINTS ============

  // AI-powered keyword discovery for a brand
  app.post("/api/keyword-research/discover", aiLimitMiddleware, async (req, res) => {
    try {
      const user = requireUser(req);
      const { brandId } = req.body ?? {};
      if (!brandId || typeof brandId !== "string") {
        return res.status(400).json({ success: false, error: "Brand ID is required" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({
          success: false,
          error: "AI keyword discovery is not available. OpenAI API key is not configured.",
          message: "Please contact support to enable keyword discovery.",
        });
      }

      const brand = await requireBrand(brandId, user.id);

      const competitors = await storage.getCompetitors(brandId);
      const competitorContext =
        competitors.length > 0 ? `Competitors: ${competitors.map((c) => c.name).join(", ")}.` : "";

      let response;
      try {
        response = await openai.chat.completions.create({
          model: MODELS.keywordResearch,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are an expert keyword researcher specializing in AI search optimization (GEO - Generative Engine Optimization). Your goal is to find keywords that will help brands get cited by AI search engines like ChatGPT, Claude, Perplexity, and Google AI.

Return a JSON object of the shape:
{
  "keywords": [
    {
      "keyword": "primary keyword phrase",
      "searchVolume": 1000-50000,
      "difficulty": 1-100,
      "opportunityScore": 1-100,
      "aiCitationPotential": 1-100,
      "intent": "informational" | "commercial" | "transactional" | "navigational",
      "category": "topic category",
      "competitorGap": 0-100,
      "suggestedContentType": "article" | "guide" | "comparison" | "how-to" | "listicle",
      "relatedKeywords": ["related term 1", "related term 2"]
    }
  ]
}

Focus on:
1. Questions AI assistants commonly answer
2. Comparison queries ("X vs Y")
3. "Best of" and recommendation queries
4. How-to and educational content
5. Industry-specific expertise queries`,
            },
            {
              role: "user",
              content: `Discover 12-15 high-opportunity keywords for this brand:

Brand: ${brand.name}
Company: ${brand.companyName}
Industry: ${brand.industry}
Description: ${brand.description || "Not specified"}
Products/Services: ${brand.products?.join(", ") || "Not specified"}
Target Audience: ${brand.targetAudience || "Not specified"}
${competitorContext}

Find keywords that would help this brand get cited by AI search engines. Prioritize queries where creating authoritative content could establish the brand as a trusted source.`,
            },
          ],
          max_tokens: 2000,
        });
      } catch (aiErr: any) {
        if (aiErr?.status === 429) {
          return res.status(429).json({
            success: false,
            error: "AI is busy right now. Please wait a moment and try again.",
          });
        }
        if (aiErr?.status === 401) {
          return res
            .status(503)
            .json({ success: false, error: "AI service is misconfigured. Contact support." });
        }
        if (aiErr?.name === "AbortError" || aiErr?.name === "TimeoutError") {
          return res
            .status(504)
            .json({ success: false, error: "Keyword discovery timed out. Please try again." });
        }
        return res
          .status(502)
          .json({ success: false, error: "AI service error. Please try again shortly." });
      }

      const rawContent = response.choices[0].message.content;
      const parsed = safeParseJson<{ keywords?: any[] } | any[]>(rawContent);
      const keywords: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as any)?.keywords)
          ? (parsed as any).keywords
          : [];

      if (keywords.length === 0) {
        return res.status(502).json({
          success: false,
          error: "AI returned an unexpected response. Please try again.",
        });
      }

      const existingKeywords = await storage.getKeywordResearch(brandId, {});
      const existingSet = new Set(existingKeywords.map((k) => k.keyword.trim().toLowerCase()));

      const savedKeywords = [];
      for (const kw of keywords) {
        if (!kw || typeof kw.keyword !== "string" || !kw.keyword.trim()) continue;
        const normalized = kw.keyword.trim().toLowerCase();
        if (existingSet.has(normalized)) continue;
        existingSet.add(normalized);
        const saved = await storage.createKeywordResearch({
          brandId,
          keyword: kw.keyword.trim(),
          searchVolume: typeof kw.searchVolume === "number" ? kw.searchVolume : null,
          difficulty: typeof kw.difficulty === "number" ? kw.difficulty : null,
          opportunityScore: typeof kw.opportunityScore === "number" ? kw.opportunityScore : 50,
          aiCitationPotential:
            typeof kw.aiCitationPotential === "number" ? kw.aiCitationPotential : 50,
          intent: kw.intent || "informational",
          category: kw.category || null,
          competitorGap: typeof kw.competitorGap === "number" ? kw.competitorGap : 0,
          suggestedContentType: kw.suggestedContentType || "article",
          relatedKeywords: Array.isArray(kw.relatedKeywords) ? kw.relatedKeywords : null,
          status: "discovered",
          contentGenerated: 0,
          articleId: null,
        });
        savedKeywords.push(saved);
      }

      if (savedKeywords.length === 0) {
        return res.status(200).json({
          success: false,
          error:
            "No new keywords found — try completing your brand profile (description, products, target audience) for better results.",
          count: 0,
        });
      }

      res.json({
        success: true,
        data: savedKeywords,
        count: savedKeywords.length,
      });
    } catch (error) {
      sendError(res, error, "Failed to discover keywords");
    }
  });

  // Get keyword research for a brand
  app.get("/api/keyword-research/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { status, category } = req.query;

      const keywords = await storage.getKeywordResearch(brandId, {
        status: status as string,
        category: category as string,
      });

      res.json({
        success: true,
        data: keywords,
      });
    } catch (error) {
      console.error("Get keyword research error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch keywords" });
    }
  });

  // Get top keyword opportunities
  app.get("/api/keyword-research/:brandId/opportunities", async (req, res) => {
    try {
      const { brandId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      const keywords = await storage.getTopKeywordOpportunities(brandId, limit);

      res.json({
        success: true,
        data: keywords,
      });
    } catch (error) {
      console.error("Get opportunities error:", error);
      res.status(500).json({ success: false, error: "Failed to fetch opportunities" });
    }
  });

  // Update keyword research status
  app.patch("/api/keyword-research/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireKeywordResearch(req.params.id, user.id);
      const update = pickFields(req.body, [
        "keyword",
        "searchVolume",
        "difficulty",
        "opportunityScore",
        "aiCitationPotential",
        "intent",
        "category",
        "competitorGap",
        "suggestedContentType",
        "relatedKeywords",
        "status",
        "contentGenerated",
      ] as const);
      const updated = await storage.updateKeywordResearch(req.params.id, update as any);
      if (!updated) {
        return res.status(404).json({ success: false, error: "Keyword not found" });
      }
      res.json({ success: true, data: updated });
    } catch (error) {
      sendError(res, error, "Failed to update keyword");
    }
  });

  // Delete keyword research
  app.delete("/api/keyword-research/:id", async (req, res) => {
    try {
      const user = requireUser(req);
      await requireKeywordResearch(req.params.id, user.id);
      const deleted = await storage.deleteKeywordResearch(req.params.id);
      res.json({ success: true, deleted });
    } catch (error) {
      sendError(res, error, "Failed to delete keyword");
    }
  });

  // ============ END KEYWORD RESEARCH ENDPOINTS ============
}
