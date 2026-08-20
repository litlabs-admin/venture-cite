# Vercel Hobby Single-Path Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate content generation from Chat Completions streaming (with continuation prompts and 60s function ceiling) to OpenAI Responses API in `background: true` mode, so a single LLM call handles any article length without touching the existing /advance polling architecture for citation runs, onboarding, or workflows.

**Architecture:** The /advance endpoint stays. Inside it, content gen now creates an OpenAI Responses run on first call (returns instantly), then polls `responses.retrieve()` on subsequent calls. The work executes on OpenAI's infrastructure, decoupled from our 60s Vercel function ceiling. UX shifts from token-by-token streaming to time-driven phase indicators ("Brainstorming → Drafting → Writing → Polishing") over a skeleton outline, with a final reveal when retrieve returns `completed`.

**Tech Stack:** Drizzle ORM, OpenAI Node SDK v5.23+, Vitest, Express, React + TanStack Query, Postgres.

**Critical safety rule:** All 207 existing tests must continue to pass. Render deploy (`npm run dev`, `initScheduler`, lazy-eval) must continue to work unchanged. Citation runs, onboarding, workflows, scheduled jobs are NOT touched.

---

## Phase 0: Pre-flight baseline

### Task 0: Verify clean starting state

**Files:** none (read-only)

- [ ] **Step 1: Confirm tests + lint + build are clean before changing anything**

Run:
```
npx tsc --noEmit
npx vitest run
npm run lint
npx vite build
```

Expected:
- tsc: no output (clean)
- vitest: `Tests 207 passed`
- lint: `0 errors` (warnings are pre-existing and OK)
- vite build: `✓ built in <time>`

If any of these fail, **STOP** and resolve before proceeding. Every subsequent task assumes a green baseline.

- [ ] **Step 2: Confirm working directory is clean**

Run: `git status --short | wc -l`
Expected: nonzero (we have uncommitted Vercel migration work) — but note the count. Each subsequent task should add a small, predictable diff.

---

## Phase 1: Schema migration

### Task 1: Add `openai_response_id` column to `content_generation_jobs`

**Files:**
- Create: `migrations/0045_content_job_openai_response.sql`
- Modify: `shared/schema.ts:344` area (within `contentGenerationJobs` pgTable)

- [ ] **Step 1: Create the migration SQL**

Create `migrations/0045_content_job_openai_response.sql`:
```sql
-- Vercel migration: OpenAI Responses API (background mode) for content
-- generation. The response runs on OpenAI's servers; we store the ID and
-- poll openai.responses.retrieve() to check status. Decouples generation
-- length from our 60s function ceiling.
--
-- Existing in-flight jobs (status='pending'|'running' with stream_buffer
-- already populated) cannot be cleanly resumed in the new model — they
-- have no response_id to retrieve. The slice runner detects them via
-- (openai_response_id IS NULL AND length(stream_buffer) > 0) and marks
-- them failed so users get a clean retry.

ALTER TABLE content_generation_jobs
  ADD COLUMN IF NOT EXISTS openai_response_id TEXT;
```

- [ ] **Step 2: Add the Drizzle field to `shared/schema.ts`**

Find the `contentGenerationJobs` pgTable (around line 323) and add the field next to `lastAdvanceStartedAt`:

```ts
    // Vercel migration: per-call slice lock. /advance updates this when
    // it claims the job for an 8s slice; concurrent advance calls bail.
    lastAdvanceStartedAt: timestamp("last_advance_started_at"),
    // Vercel migration: ID of the OpenAI Responses run executing this
    // job. Set by the first /advance call; subsequent calls poll
    // openai.responses.retrieve(openaiResponseId). Null on legacy jobs
    // and on jobs not yet started.
    openaiResponseId: text("openai_response_id"),
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 4: Verify all tests still pass** (no regressions from schema addition)

Run: `npx vitest run`
Expected: `Tests 207 passed`

- [ ] **Step 5: Commit**

```bash
git add migrations/0045_content_job_openai_response.sql shared/schema.ts
git commit -m "schema: add openai_response_id to content_generation_jobs

Foundation for OpenAI Responses API (background mode) content
generation. Existing column added nullable; runtime code added
in subsequent commits."
```

---

## Phase 2: Storage layer for response_id

### Task 2: Add `updateContentJobResponseId` storage method

**Files:**
- Modify: `server/storage.ts` (interface)
- Modify: `server/databaseStorage.ts` (implementation)

- [ ] **Step 1: Add the interface declaration in `server/storage.ts`**

Find the content-generation section (around line 249, after `getContentJobByIdAdmin`) and add:

```ts
  // Vercel migration: link an OpenAI Responses run to a content job.
  // Idempotent — passing the same id is a no-op. Used by runArticleSlice's
  // first call to record which OpenAI run owns this job.
  updateContentJobResponseId(
    jobId: string,
    openaiResponseId: string,
  ): Promise<void>;
```

Add it directly above `getActiveContentJob`.

- [ ] **Step 2: Add the implementation in `server/databaseStorage.ts`**

Find `getContentJobByIdAdmin` (around line 920) and add after it (before `getActiveContentJob`):

```ts
  async updateContentJobResponseId(
    jobId: string,
    openaiResponseId: string,
  ): Promise<void> {
    await db
      .update(schema.contentGenerationJobs)
      .set({ openaiResponseId })
      .where(eq(schema.contentGenerationJobs.id, jobId));
  }
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Verify all tests still pass**

Run: `npx vitest run`
Expected: `Tests 207 passed`

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts server/databaseStorage.ts
git commit -m "storage: add updateContentJobResponseId

Used by runArticleSlice's first call to persist the OpenAI Responses
run ID for later polling."
```

---

## Phase 3: New content slice — TDD

### Task 3: Test scaffolding for Responses-based slice

**Files:**
- Create: `tests/unit/contentGenerationResponses.test.ts`

This test file will grow incrementally across Tasks 3-7. We start with the test infrastructure and one failing test.

- [ ] **Step 1: Create the test file with mock setup and one initial test**

Create `tests/unit/contentGenerationResponses.test.ts`:

```ts
// Vercel migration: tests for the Responses API-based content slice.
// Mocks openai.responses.{create,retrieve}, the storage layer, and the
// Sentry instrumentation. Verifies state transitions across /advance
// calls without hitting OpenAI or the database.

import { describe, it, expect, beforeEach, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  responsesCreate: vi.fn(),
  responsesRetrieve: vi.fn(),
  getJob: vi.fn(),
  updateJob: vi.fn(async () => undefined),
  setResponseId: vi.fn(async () => undefined),
  setArticleReady: vi.fn(async () => undefined),
  setArticleFailed: vi.fn(async () => undefined),
  setArticleDraft: vi.fn(async () => undefined),
  setArticleGeneratingFromDraft: vi.fn(async () => undefined),
  createRevision: vi.fn(async () => undefined),
  getUser: vi.fn(async () => ({ accessTier: "free" })),
  getBrandById: vi.fn(async () => null),
  refundQuota: vi.fn(async () => undefined),
  assertWithinBudget: vi.fn(async () => undefined),
  recordSpend: vi.fn(async () => undefined),
}));

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    responses = {
      create: stubs.responsesCreate,
      retrieve: stubs.responsesRetrieve,
    };
    chat = { completions: { create: vi.fn() } };
  },
}));
vi.mock("../../server/storage", () => ({
  storage: {
    getContentJobByIdAdmin: stubs.getJob,
    updateContentJob: stubs.updateJob,
    updateContentJobResponseId: stubs.setResponseId,
    setArticleReady: stubs.setArticleReady,
    setArticleFailed: stubs.setArticleFailed,
    setArticleDraft: stubs.setArticleDraft,
    setArticleGeneratingFromDraft: stubs.setArticleGeneratingFromDraft,
    createRevision: stubs.createRevision,
    getUser: stubs.getUser,
    getBrandById: stubs.getBrandById,
    appendStreamBuffer: vi.fn(),
  },
}));
vi.mock("../../server/lib/usageLimit", () => ({
  refundArticleQuota: stubs.refundQuota,
}));
vi.mock("../../server/lib/llmBudget", () => ({
  assertWithinBudget: stubs.assertWithinBudget,
  recordSpend: stubs.recordSpend,
  isBudgetExceededError: () => false,
}));
vi.mock("../../server/lib/circuitBreaker", () => ({
  openaiBreaker: { run: async (fn: () => Promise<unknown>) => fn() },
  isCircuitOpenError: () => false,
}));
vi.mock("../../server/lib/aiLogger", () => ({
  attachAiLogger: () => undefined,
}));
vi.mock("../../server/lib/modelConfig", () => ({
  MODELS: { contentGeneration: "gpt-4o-mini" },
}));
vi.mock("../../server/instrument", () => ({
  Sentry: { captureException: vi.fn() },
}));
vi.mock("../../server/db", () => ({
  db: {},
  pool: {},
}));

const { runArticleSlice } = await import("../../server/contentGenerationWorker");

beforeEach(() => {
  for (const fn of Object.values(stubs)) {
    if (typeof (fn as { mockClear?: () => void }).mockClear === "function") {
      (fn as { mockClear: () => void }).mockClear();
    }
  }
});

describe("runArticleSlice (Responses API)", () => {
  it("returns done:true status:failed when job is not found", async () => {
    stubs.getJob.mockResolvedValueOnce(undefined);
    const out = await runArticleSlice("missing-id", Date.now() + 1000);
    expect(out).toMatchObject({ done: true, status: "failed" });
  });
});
```

- [ ] **Step 2: Run the test — confirm it passes (sanity check the mock wiring)**

Run: `npx vitest run tests/unit/contentGenerationResponses.test.ts`
Expected: `Tests 1 passed`

If it fails because of mock-wiring issues (typos in module paths, missing mocks), fix before proceeding. The new module path `../../server/contentGenerationWorker` must resolve — verify by adjusting the relative depth if needed.

- [ ] **Step 3: Verify the full test suite still passes**

Run: `npx vitest run`
Expected: `Tests 208 passed` (207 existing + 1 new).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/contentGenerationResponses.test.ts
git commit -m "test: scaffold contentGenerationResponses test file

Mocks for OpenAI Responses API, storage layer, and instrumentation.
First test verifies the not-found early-return.

Subsequent commits add per-state-transition tests + implementation."
```

### Task 4: Test — first /advance creates a Responses run

**Files:**
- Modify: `tests/unit/contentGenerationResponses.test.ts`

- [ ] **Step 1: Add the failing test**

In `tests/unit/contentGenerationResponses.test.ts`, append inside `describe("runArticleSlice (Responses API)", ...)`:

```ts
  it("creates an OpenAI Responses run on first /advance and returns done:false", async () => {
    stubs.getJob.mockResolvedValueOnce({
      id: "job-1",
      userId: "user-1",
      brandId: "brand-1",
      articleId: "article-1",
      status: "pending",
      streamBuffer: "",
      openaiResponseId: null,
      requestPayload: {
        keywords: "crm comparison",
        industry: "saas",
        type: "Article",
        articleId: "article-1",
      },
    });
    stubs.responsesCreate.mockResolvedValueOnce({ id: "resp-abc", status: "queued" });

    const out = await runArticleSlice("job-1", Date.now() + 1000);

    expect(stubs.responsesCreate).toHaveBeenCalledTimes(1);
    expect(stubs.responsesCreate.mock.calls[0][0]).toMatchObject({
      background: true,
      store: true,
    });
    expect(stubs.setResponseId).toHaveBeenCalledWith("job-1", "resp-abc");
    expect(out).toEqual({ done: false, status: "running" });
    // Critical: retrieve is NOT called on the same /advance that creates.
    expect(stubs.responsesRetrieve).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the test — expect it to FAIL**

Run: `npx vitest run tests/unit/contentGenerationResponses.test.ts`
Expected: failure mentioning `responsesCreate` was not called (because the current implementation uses Chat Completions, not Responses API).

This is the red phase of TDD. The implementation comes in Task 7.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/unit/contentGenerationResponses.test.ts
git commit -m "test: red — first /advance creates Responses run

Failing test for Task 7 implementation."
```

### Task 5: Test — subsequent /advance polls retrieve

**Files:**
- Modify: `tests/unit/contentGenerationResponses.test.ts`

- [ ] **Step 1: Add the failing test**

Append to the describe block:

```ts
  it("polls openai.responses.retrieve on subsequent /advance and returns done:false while in_progress", async () => {
    stubs.getJob.mockResolvedValueOnce({
      id: "job-2",
      userId: "user-1",
      brandId: null,
      articleId: "article-2",
      status: "running",
      streamBuffer: "",
      openaiResponseId: "resp-xyz",
      requestPayload: { keywords: "x", industry: "y", type: "Article", articleId: "article-2" },
    });
    stubs.responsesRetrieve.mockResolvedValueOnce({ id: "resp-xyz", status: "in_progress" });

    const out = await runArticleSlice("job-2", Date.now() + 1000);

    expect(stubs.responsesRetrieve).toHaveBeenCalledWith("resp-xyz");
    expect(stubs.responsesCreate).not.toHaveBeenCalled();
    expect(stubs.setResponseId).not.toHaveBeenCalled();
    expect(out).toEqual({ done: false, status: "running" });
  });
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/unit/contentGenerationResponses.test.ts`
Expected: failure (current code calls neither create nor retrieve).

- [ ] **Step 3: Commit failing test**

```bash
git add tests/unit/contentGenerationResponses.test.ts
git commit -m "test: red — /advance polls retrieve when response exists"
```

### Task 6: Test — completed status finalizes article + failed/cancelled handling

**Files:**
- Modify: `tests/unit/contentGenerationResponses.test.ts`

- [ ] **Step 1: Add the three tests**

```ts
  it("on completed status, persists content to article and returns done:true", async () => {
    stubs.getJob.mockResolvedValueOnce({
      id: "job-3",
      userId: "user-1",
      brandId: null,
      articleId: "article-3",
      status: "running",
      streamBuffer: "",
      openaiResponseId: "resp-done",
      requestPayload: { keywords: "k", industry: "i", type: "Article", articleId: "article-3" },
    });
    stubs.responsesRetrieve.mockResolvedValueOnce({
      id: "resp-done",
      status: "completed",
      output_text: "# My Article\n\nFull content here.",
      usage: { input_tokens: 100, output_tokens: 500 },
    });

    const out = await runArticleSlice("job-3", Date.now() + 1000);

    expect(stubs.setArticleReady).toHaveBeenCalledWith(
      "article-3",
      expect.stringContaining("# My Article"),
      expect.any(String),
    );
    expect(stubs.createRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: "article-3",
        source: "generated",
      }),
    );
    expect(stubs.updateJob).toHaveBeenCalledWith(
      "job-3",
      expect.objectContaining({ status: "succeeded" }),
    );
    expect(out).toEqual({ done: true, status: "succeeded" });
  });

  it("on failed status, marks job failed and refunds quota", async () => {
    stubs.getJob.mockResolvedValueOnce({
      id: "job-4",
      userId: "user-1",
      brandId: null,
      articleId: "article-4",
      status: "running",
      streamBuffer: "",
      openaiResponseId: "resp-fail",
      requestPayload: { keywords: "k", industry: "i", type: "Article", articleId: "article-4" },
    });
    stubs.responsesRetrieve.mockResolvedValueOnce({
      id: "resp-fail",
      status: "failed",
      error: { message: "Model overloaded" },
    });

    const out = await runArticleSlice("job-4", Date.now() + 1000);

    expect(stubs.updateJob).toHaveBeenCalledWith(
      "job-4",
      expect.objectContaining({ status: "failed" }),
    );
    expect(stubs.setArticleFailed).toHaveBeenCalledWith("article-4");
    expect(stubs.refundQuota).toHaveBeenCalled();
    expect(out).toMatchObject({ done: true, status: "failed" });
  });

  it("on cancelled status, marks job cancelled and resets article to draft", async () => {
    stubs.getJob.mockResolvedValueOnce({
      id: "job-5",
      userId: "user-1",
      brandId: null,
      articleId: "article-5",
      status: "running",
      streamBuffer: "",
      openaiResponseId: "resp-cancel",
      requestPayload: { keywords: "k", industry: "i", type: "Article", articleId: "article-5" },
    });
    stubs.responsesRetrieve.mockResolvedValueOnce({
      id: "resp-cancel",
      status: "cancelled",
    });

    const out = await runArticleSlice("job-5", Date.now() + 1000);

    expect(stubs.updateJob).toHaveBeenCalledWith(
      "job-5",
      expect.objectContaining({ status: "cancelled" }),
    );
    expect(stubs.setArticleDraft).toHaveBeenCalledWith("article-5");
    expect(out).toEqual({ done: true, status: "cancelled" });
  });
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/unit/contentGenerationResponses.test.ts`
Expected: 3 failing tests (in addition to the 2 from Tasks 4-5).

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/unit/contentGenerationResponses.test.ts
git commit -m "test: red — completed/failed/cancelled state handling"
```

### Task 7: Test — legacy in-flight job marked failed

**Files:**
- Modify: `tests/unit/contentGenerationResponses.test.ts`

- [ ] **Step 1: Add the test**

```ts
  it("legacy in-flight job (streamBuffer populated, no response_id) is marked failed without calling OpenAI", async () => {
    stubs.getJob.mockResolvedValueOnce({
      id: "job-legacy",
      userId: "user-1",
      brandId: null,
      articleId: "article-legacy",
      status: "running",
      // Pre-Vercel-Responses code wrote tokens here.
      streamBuffer: "Partial content from old code path...",
      openaiResponseId: null,
      requestPayload: { keywords: "k", industry: "i", type: "Article", articleId: "article-legacy" },
    });

    const out = await runArticleSlice("job-legacy", Date.now() + 1000);

    expect(stubs.responsesCreate).not.toHaveBeenCalled();
    expect(stubs.responsesRetrieve).not.toHaveBeenCalled();
    expect(stubs.updateJob).toHaveBeenCalledWith(
      "job-legacy",
      expect.objectContaining({
        status: "failed",
        errorMessage: expect.stringContaining("legacy"),
      }),
    );
    expect(stubs.setArticleFailed).toHaveBeenCalledWith("article-legacy");
    expect(stubs.refundQuota).toHaveBeenCalled();
    expect(out).toMatchObject({ done: true, status: "failed" });
  });
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/unit/contentGenerationResponses.test.ts`
Expected: 1 additional failing test.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/contentGenerationResponses.test.ts
git commit -m "test: red — legacy in-flight job detection and clean failure"
```

---

## Phase 4: Implement the Responses-API slice

### Task 8: Replace `runJobToCompletionOrDeadline` with Responses-based implementation

**Files:**
- Modify: `server/contentGenerationWorker.ts:112-305` (the entire `runJobToCompletionOrDeadline` function)

This is the largest single edit in the plan. We replace the function body but keep the same name and signature so call sites in `runArticleSlice` don't change.

- [ ] **Step 1: Read the current function header to confirm signature**

Run: `grep -n "async function runJobToCompletionOrDeadline" c:/Users/yoges/OneDrive/Desktop/venturecite/server/contentGenerationWorker.ts`
Expected output: line ~112 with signature `async function runJobToCompletionOrDeadline(job: ContentGenerationJob, executionDeadline: number): Promise<SliceResult>`.

The new implementation keeps this exact signature.

- [ ] **Step 2: Replace the function body**

Open `server/contentGenerationWorker.ts`. Replace the entire `runJobToCompletionOrDeadline` function (from `async function runJobToCompletionOrDeadline(` to its closing `}` — currently ~190 lines) with:

```ts
async function runJobToCompletionOrDeadline(
  job: ContentGenerationJob,
  _executionDeadline: number,
): Promise<SliceResult> {
  const payload = job.requestPayload as unknown as GenerationPayload;
  const { keywords, industry, type, brandId, articleId, targetCustomers, geography, contentStyle = "b2c" } = payload;

  if (!articleId) {
    throw new Error("Job is missing articleId — cannot fill draft");
  }

  // Legacy job migration: pre-Responses code wrote partial tokens to
  // stream_buffer. Those jobs cannot be cleanly resumed with the new
  // model — the original Chat Completions stream is gone, and the only
  // way forward is to fail the job so the user retries. We mark the
  // error with name="TimeoutError" so classifyError() returns "timeout",
  // which refundArticleQuota treats as refundable (the failure is on
  // our infra side, not the user's prompt).
  const existingBuffer = (job.streamBuffer ?? "") as string;
  const existingResponseId = (job as unknown as { openaiResponseId: string | null }).openaiResponseId;
  if (!existingResponseId && existingBuffer.length > 0) {
    const err: Error & { name?: string } = new Error(
      "legacy in-flight job from a prior deploy — please retry generation",
    );
    err.name = "TimeoutError";
    throw err;
  }

  const userRow = await storage.getUser(job.userId);
  const tier = (userRow?.accessTier ?? "free") as Tier;
  await assertWithinBudget(job.userId, tier);

  // Flip the article into 'generating' on the first call. Idempotent.
  await storage.setArticleGeneratingFromDraft(articleId, job.id);

  // First /advance call: kick off the OpenAI Responses run. Returns
  // immediately; the actual work runs on OpenAI's servers.
  if (!existingResponseId) {
    const brand = brandId ? await storage.getBrandById(brandId) : null;
    const promptText = buildContentPrompt({
      keywords,
      industry,
      type,
      brand,
      targetCustomers,
      geography,
      contentStyle,
    });

    const response = await openaiBreaker.run(() =>
      openai.responses.create({
        model: MODELS.contentGeneration,
        input: promptText,
        background: true,
        store: true,
      }),
    );

    await storage.updateContentJobResponseId(job.id, response.id);

    return { kind: "deadline", partialContent: "" };
  }

  // Subsequent /advance calls: poll OpenAI for completion.
  const response = await openaiBreaker.run(() => openai.responses.retrieve(existingResponseId));

  if (response.status === "completed") {
    const finalContent = extractResponseText(response);
    if (!finalContent) {
      // Refundable — empty output is a model anomaly, not user input.
      const err: Error & { name?: string } = new Error("OpenAI Responses run completed with empty output");
      err.name = "TimeoutError";
      throw err;
    }

    if (response.usage) {
      await recordSpend({
        userId: job.userId,
        service: "openai",
        model: MODELS.contentGeneration,
        tokensIn: response.usage.input_tokens ?? 0,
        tokensOut: response.usage.output_tokens ?? 0,
      });
    }

    const headingMatch = finalContent.match(/^#\s+(.+)$/m);
    const title = headingMatch?.[1]?.trim() || `${keywords} — ${industry}`;
    await storage.setArticleReady(articleId, finalContent, title);
    await storage.createRevision({
      articleId,
      content: finalContent,
      source: "generated",
      createdBy: "system",
    });
    return { kind: "completed", finalContent };
  }

  if (response.status === "failed") {
    // OpenAI-side failure → refundable (treat as timeout in classifyError
    // so the user gets their quota back and can retry).
    const message = response.error?.message ?? "OpenAI Responses run failed";
    const err: Error & { name?: string } = new Error(message);
    err.name = "TimeoutError";
    throw err;
  }

  if (response.status === "cancelled") {
    return { kind: "cancelled" };
  }

  if (response.status === "incomplete") {
    // Incomplete means the run was truncated (e.g. max_output_tokens
    // hit). Refundable — user should retry with adjusted scope.
    const reason = response.incomplete_details?.reason ?? "incomplete";
    const err: Error & { name?: string } = new Error(`OpenAI Responses run incomplete: ${reason}`);
    err.name = "TimeoutError";
    throw err;
  }

  // queued | in_progress — still running, return deadline-style outcome
  // so the caller treats this slice as "more work to do."
  return { kind: "deadline", partialContent: "" };
}

// Build the user prompt text from the job's request payload.
function buildContentPrompt(args: {
  keywords: string;
  industry: string;
  type: string;
  brand: { companyName: string | null; name: string | null; industry: string | null; description: string | null; tone: string | null; targetAudience: string | null; products: string[] | null; uniqueSellingPoints: string[] | null } | null;
  targetCustomers?: string;
  geography?: string;
  contentStyle: "b2b" | "b2c";
}): string {
  const { keywords, industry, type, brand, targetCustomers, geography, contentStyle } = args;

  const contentTypePrompts: Record<string, string> = {
    Article: "comprehensive article (1500-2000 words)",
    "Blog Post": "in-depth blog post (1200-1500 words)",
    "Product Description": "detailed product guide (800-1000 words)",
    "Social Media Post": "engaging social media content series (500-700 words total)",
  };
  const promptType = contentTypePrompts[type] || "comprehensive content (1500+ words)";

  let brandContext = "";
  if (brand) {
    brandContext = `\n\nBRAND INFO:\n- Company: ${brand.companyName}\n- Brand: ${brand.name}\n- Industry: ${brand.industry}${brand.description ? `\n- Description: ${brand.description}` : ""}${brand.tone ? `\n- Tone: ${brand.tone}` : ""}${brand.targetAudience ? `\n- Audience: ${brand.targetAudience}` : ""}${brand.products?.length ? `\n- Products: ${brand.products.join(", ")}` : ""}${brand.uniqueSellingPoints?.length ? `\n- USPs: ${brand.uniqueSellingPoints.join(", ")}` : ""}\n\nIncorporate the brand's identity naturally.`;
  }

  let audienceContext = "";
  if (targetCustomers || geography) {
    audienceContext = `\n\nTARGET AUDIENCE:${targetCustomers ? `\n- Customers: ${targetCustomers}` : ""}${geography ? `\n- Geography: ${geography}` : ""}`;
  }

  const isB2C = contentStyle === "b2c";
  const styleDirective = isB2C
    ? `\n\nSTYLE: B2C — warm, conversational, benefit-first, second-person, lifestyle framing. No jargon.`
    : `\n\nSTYLE: B2B — professional, data-driven, ROI-focused, industry terminology, business impact framing.`;

  const systemPreamble = `You are an expert content strategist specializing in GEO (Generative Engine Optimization). Create authoritative, well-structured markdown content that AI platforms like ChatGPT, Claude, and Perplexity would cite as a reliable source. Always include: clear intro, multiple sections with H2/H3 headings, practical examples, FAQ with 4-6 questions, strong conclusion.\n\n`;
  const userPart = `Write a ${promptType} about "${keywords}" for the ${industry} industry.${brandContext}${audienceContext}${styleDirective}\n\nUse markdown (# title, ## sections, ### subsections). Include an FAQ section.`;
  return `${systemPreamble}${userPart}`;
}

// Extract markdown text from a Responses API result. The SDK exposes
// output_text as a convenience; fall back to walking output[].content[]
// if the convenience field is absent (e.g. older SDK or mocks).
function extractResponseText(response: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}): string {
  if (typeof response.output_text === "string" && response.output_text.length > 0) {
    return response.output_text;
  }
  const segments: string[] = [];
  for (const item of response.output ?? []) {
    for (const c of item.content ?? []) {
      if (c.type === "output_text" && typeof c.text === "string") {
        segments.push(c.text);
      }
    }
  }
  return segments.join("");
}
```

- [ ] **Step 3: Update the surrounding `runArticleSlice` to handle the legacy job `LegacyJobError`**

The thrown `LegacyJobError` lands in `runArticleSlice`'s catch block (line ~346 area). The existing `classifyError` returns `"unknown"` for unknown error names, which is fine — but we want the user-facing error message to be clear. Inspect the existing error-handling branch and confirm the message is propagated to `errorMessage`. No code change required if the existing branch already does `message: err instanceof Error ? err.message : String(err)`.

Verify by reading `server/contentGenerationWorker.ts:346-391`. The `message.slice(0, 500)` line preserves the legacy message verbatim — good.

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

If there are errors:
- Most likely: `extractResponseText` argument type doesn't match SDK return type. Cast to `unknown` then to the helper's expected shape inside the call site.
- If `MODELS.contentGeneration` isn't compatible with the Responses API model parameter, replace with a string literal `"gpt-4o-mini"` for now and note as a follow-up.

- [ ] **Step 5: Run the new test file**

Run: `npx vitest run tests/unit/contentGenerationResponses.test.ts`
Expected: `Tests 7 passed` (1 sanity + 1 + 1 + 3 + 1 = 7).

If a test fails, fix the implementation (NOT the test — the test encodes the spec). Common issues:
- The legacy-job branch didn't fire because `errorMessage` wasn't propagated. Verify the throw + outer catch wiring.
- `responses.retrieve` was called without an argument: verify the implementation passes `existingResponseId`.
- `setResponseId` was called twice: ensure the existing-response-id branch returns before reaching the create call.

- [ ] **Step 6: Run the FULL test suite**

Run: `npx vitest run`
Expected: `Tests 214 passed` (207 existing + 7 new).

**Critical safety check:** if any of the original 207 tests now fail, STOP. The implementation broke a non-content-gen feature. Roll back this commit and investigate.

- [ ] **Step 7: Commit**

```bash
git add server/contentGenerationWorker.ts
git commit -m "feat: replace Chat Completions streaming with Responses API background

Single LLM call per article runs on OpenAI infra; first /advance creates
the run, subsequent /advance calls poll responses.retrieve. Decouples
generation length from the 60s function timeout. Legacy in-flight jobs
detected and failed cleanly so users get a clean retry."
```

---

## Phase 5: Adapt /state response shape

### Task 9: Test — /state returns phase + elapsedMs

**Files:**
- Modify: `tests/unit/contentGenerationResponses.test.ts`

We add tests at the route layer to verify the response shape change. The /state route is in `server/routes/content.ts` and currently returns `{ status, delta, contentLength, errorMessage, done }`. We need it to return `{ status, done, errorMessage, phase?, elapsedMs? }`.

- [ ] **Step 1: Add a route-level test** (in a new describe block in the same file)

Append to `tests/unit/contentGenerationResponses.test.ts`:

```ts
describe("/state response shape", () => {
  // Imported lazily so the mocks above are wired up.
  it("returns phase and elapsedMs when job is in_progress", async () => {
    // We exercise the response-builder helper directly rather than
    // standing up Express. The helper takes a job and computes the
    // user-facing state shape.
    const { computeJobStatePayload } = await import("../../server/routes/content");
    const startedAt = new Date(Date.now() - 12_000); // 12s ago
    const payload = computeJobStatePayload({
      status: "running",
      streamBuffer: "",
      errorMessage: null,
      openaiResponseId: "resp-123",
      startedAt,
    } as never);
    expect(payload.done).toBe(false);
    expect(payload.status).toBe("running");
    expect(payload.elapsedMs).toBeGreaterThanOrEqual(11_000);
    expect(payload.phase).toMatch(/Brainstorming|Drafting|Writing|Polishing/);
  });

  it("returns done:true when job is succeeded", async () => {
    const { computeJobStatePayload } = await import("../../server/routes/content");
    const payload = computeJobStatePayload({
      status: "succeeded",
      streamBuffer: "",
      errorMessage: null,
      openaiResponseId: "resp-done",
      startedAt: new Date(Date.now() - 30_000),
    } as never);
    expect(payload.done).toBe(true);
    expect(payload.status).toBe("succeeded");
  });

  it("returns errorMessage when job failed", async () => {
    const { computeJobStatePayload } = await import("../../server/routes/content");
    const payload = computeJobStatePayload({
      status: "failed",
      streamBuffer: "",
      errorMessage: "OpenAI overloaded",
      openaiResponseId: "resp-fail",
      startedAt: new Date(Date.now() - 5_000),
    } as never);
    expect(payload.done).toBe(true);
    expect(payload.status).toBe("failed");
    expect(payload.errorMessage).toBe("OpenAI overloaded");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/unit/contentGenerationResponses.test.ts`
Expected: 3 failing tests (cannot import `computeJobStatePayload` because it doesn't exist).

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/unit/contentGenerationResponses.test.ts
git commit -m "test: red — /state response shape with phase + elapsedMs"
```

### Task 10: Implement `computeJobStatePayload` and update /state route

**Files:**
- Modify: `server/routes/content.ts`

- [ ] **Step 1: Add the helper export and refactor the /state route**

Open `server/routes/content.ts`. Find the existing /state handler (`app.get("/api/content-jobs/:jobId/state", ...)`). Above the `setupContentRoutes` function, add the helper:

```ts
// Vercel migration: time-driven phase indicator. The Responses API
// background mode doesn't expose intra-run progress, so we display a
// believable "what the model is doing now" message based on elapsed
// time. Engineering, not marketing — the phase boundaries are
// approximate but the user-perceived smoothness matches what production
// AI products (Notion AI, Cursor) ship.
const PHASE_BANDS: Array<{ minMs: number; label: string }> = [
  { minMs: 0, label: "Brainstorming themes" },
  { minMs: 4_000, label: "Drafting outline" },
  { minMs: 12_000, label: "Writing sections" },
  { minMs: 25_000, label: "Polishing" },
];

function phaseFor(elapsedMs: number): string {
  let label = PHASE_BANDS[0].label;
  for (const band of PHASE_BANDS) {
    if (elapsedMs >= band.minMs) label = band.label;
  }
  return label;
}

export function computeJobStatePayload(job: {
  status: string;
  streamBuffer: string | null;
  errorMessage: string | null;
  openaiResponseId: string | null;
  startedAt: Date | null;
}): {
  status: string;
  done: boolean;
  errorMessage: string | null;
  phase?: string;
  elapsedMs?: number;
} {
  const done = job.status !== "pending" && job.status !== "running";
  if (done) {
    return {
      status: job.status,
      done: true,
      errorMessage: job.errorMessage ?? null,
    };
  }
  const startMs = job.startedAt ? new Date(job.startedAt).getTime() : Date.now();
  const elapsedMs = Math.max(0, Date.now() - startMs);
  return {
    status: job.status,
    done: false,
    errorMessage: job.errorMessage ?? null,
    phase: phaseFor(elapsedMs),
    elapsedMs,
  };
}
```

- [ ] **Step 2: Update the /state route handler to use the helper**

Find the existing route handler:

```ts
  app.get("/api/content-jobs/:jobId/state", async (req: Request, res: Response) => {
    try {
      const user = requireUser(req);
      const since = Math.max(0, Number(req.query.since) || 0);
      const job = await storage.getContentJobById(req.params.jobId, user.id);
      if (!job) return res.status(404).json({ success: false, error: "Job not found" });

      const [row] = await db
        .select({...})
        .from(schema.contentGenerationJobs)
        .where(eq(schema.contentGenerationJobs.id, job.id))
        .limit(1);
      if (!row) return res.status(404).json({ success: false, error: "Job not found" });

      const buf = row.streamBuffer ?? "";
      // ...returns delta, contentLength, etc.
```

Replace the body with:

```ts
  app.get("/api/content-jobs/:jobId/state", async (req: Request, res: Response) => {
    try {
      const user = requireUser(req);
      const job = await storage.getContentJobById(req.params.jobId, user.id);
      if (!job) return res.status(404).json({ success: false, error: "Job not found" });

      const [row] = await db
        .select({
          status: schema.contentGenerationJobs.status,
          streamBuffer: schema.contentGenerationJobs.streamBuffer,
          errorMessage: schema.contentGenerationJobs.errorMessage,
          openaiResponseId: schema.contentGenerationJobs.openaiResponseId,
          startedAt: schema.contentGenerationJobs.startedAt,
        })
        .from(schema.contentGenerationJobs)
        .where(eq(schema.contentGenerationJobs.id, job.id))
        .limit(1);
      if (!row) return res.status(404).json({ success: false, error: "Job not found" });

      res.json({
        success: true,
        data: computeJobStatePayload(row),
      });
    } catch (error) {
      sendError(res, error, "Failed to read job state");
    }
  });
```

The `since` query param goes away. The route's only consumer is `client/src/pages/content.tsx`, which we update in Phase 6.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

If `openaiResponseId` isn't recognized on the schema, verify Task 1 was completed and `npm run db:migrate` ran (or that the dev DB has the column).

- [ ] **Step 4: Run new tests — expect PASS**

Run: `npx vitest run tests/unit/contentGenerationResponses.test.ts`
Expected: `Tests 10 passed`.

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: `Tests 217 passed` (210 + 7).

If any prior test fails, the most likely cause is the dropped `since` query handling. Search for callers: `grep -rn "/state?since" client/`. The only legitimate caller is `content.tsx` which we will update in Phase 6.

- [ ] **Step 6: Commit**

```bash
git add server/routes/content.ts tests/unit/contentGenerationResponses.test.ts
git commit -m "feat: /state returns phase + elapsedMs (drops streamBuffer delta)

Replaces the polling-tail response shape with a time-driven phase
indicator suitable for the Responses-API model where intra-run progress
is not exposed by OpenAI."
```

---

## Phase 6: Client UI

### Task 11: Update content.tsx polling to consume new /state shape

**Files:**
- Modify: `client/src/pages/content.tsx`

- [ ] **Step 1: Replace the polling effect**

Find the effect that posts `/advance` and gets `/state` (the one introduced in the earlier Vercel migration). Replace with:

```ts
  // Vercel migration (Responses API): client polls /state every 1s for
  // status + phase. Drives /advance every ~7s — first call kicks off the
  // OpenAI Responses run; subsequent calls poll the run status. When
  // /state.done arrives, we refetch the article (which now has final
  // content in articles.content) and stop polling.
  const [phase, setPhase] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  useEffect(() => {
    if (!isGenerating || !activeJobId) return;
    let cancelled = false;
    let stateTimer: ReturnType<typeof setTimeout> | null = null;
    let advanceTimer: ReturnType<typeof setTimeout> | null = null;

    const pollState = async () => {
      if (cancelled) return;
      try {
        const r = await apiRequest("GET", `/api/content-jobs/${activeJobId}/state`);
        const json = (await r.json()) as {
          success: boolean;
          data: {
            status: string;
            done: boolean;
            errorMessage: string | null;
            phase?: string;
            elapsedMs?: number;
          };
        };
        if (json.success) {
          if (json.data.phase) setPhase(json.data.phase);
          if (typeof json.data.elapsedMs === "number") setElapsedMs(json.data.elapsedMs);
          if (json.data.done) {
            articleQuery.refetch();
            refetchUsage();
            queryClient.invalidateQueries({ queryKey: ["/api/articles", "drafts"] });
            return;
          }
        }
      } catch {
        // Transient network failure — keep polling.
      }
      const interval = document.visibilityState === "visible" ? 1000 : 4000;
      stateTimer = setTimeout(pollState, interval);
    };

    const driveAdvance = async () => {
      if (cancelled) return;
      try {
        if (document.visibilityState === "visible") {
          await apiRequest("POST", `/api/content-jobs/${activeJobId}/advance`);
        }
      } catch {
        // ignore — /state polling will surface failure
      }
      advanceTimer = setTimeout(driveAdvance, 7000);
    };

    pollState();
    driveAdvance();

    return () => {
      cancelled = true;
      if (stateTimer) clearTimeout(stateTimer);
      if (advanceTimer) clearTimeout(advanceTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, activeJobId]);
```

The old `streamBuffer` state (`const [streamBuffer, setStreamBuffer] = useState<string>("")`) and the effect that resets it on status change can be deleted — content now lives in `article.content`, not in a client-side buffer.

- [ ] **Step 2: Find and remove streamBuffer references**

Run: `grep -n "streamBuffer" c:/Users/yoges/OneDrive/Desktop/venturecite/client/src/pages/content.tsx`
For each reference, decide:
- The state declaration → delete
- The reset effect → delete
- The render that displays `streamBuffer` content → see Task 12

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no output.

If errors mention `streamBuffer` not defined: there's still a render referencing it. We update the render in Task 12.

If errors mention unused `phase`/`elapsedMs`: we use them in Task 12.

If errors block the build, temporarily render `{phase} ({elapsedMs}ms)` somewhere visible to satisfy the compiler; we replace with proper UI in Task 12.

- [ ] **Step 4: Build check**

Run: `npx vite build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/content.tsx
git commit -m "client: poll new /state shape (phase + elapsedMs)

Drops streamBuffer state since the Responses API model doesn't expose
intra-run tokens. Article content arrives via the existing article
query refetch when /state.done = true."
```

### Task 12: Replace streaming UI with phase + skeleton + reveal

**Files:**
- Modify: `client/src/pages/content.tsx`

- [ ] **Step 1: Identify the current "while generating" render block**

Run: `grep -n "isGenerating\|streamBuffer\|status === \"generating\"" c:/Users/yoges/OneDrive/Desktop/venturecite/client/src/pages/content.tsx`

There should be a JSX block that renders content while `isGenerating` is true — typically a textarea or a markdown preview fed by `streamBuffer`.

- [ ] **Step 2: Replace the generating-state UI**

Replace the generating-state JSX with:

```tsx
{isGenerating ? (
  <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-6">
    <div className="flex items-center gap-3">
      <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      <p className="text-sm font-medium">{phase ?? "Brainstorming themes"}</p>
      <span className="ml-auto text-xs text-muted-foreground">
        {Math.floor(elapsedMs / 1000)}s
      </span>
    </div>

    <div className="space-y-3">
      {/* Skeleton: H2 + paragraph lines that fade in over time */}
      {[
        { h2: "Introduction", lines: 3 },
        { h2: "Key Considerations", lines: 4 },
        { h2: "Recommendations", lines: 5 },
        { h2: "FAQ", lines: 3 },
      ].map((section, i) => (
        <div key={i} className="space-y-2">
          <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
          {Array.from({ length: section.lines }).map((_, j) => (
            <div
              key={j}
              className="h-3 animate-pulse rounded bg-muted/60"
              style={{ width: `${60 + ((i + j) % 4) * 8}%` }}
            />
          ))}
        </div>
      ))}
    </div>

    <p className="text-xs text-muted-foreground">
      Generating your article. This may take 30-90 seconds. You can leave
      this page — generation will continue and you can return to see the
      finished article.
    </p>
  </div>
) : (
  /* Existing non-generating render: editor, article preview, etc. */
  <ExistingArticleRender />
)}
```

Adjust class names and component nesting to match the existing component structure. The `ExistingArticleRender` placeholder represents whatever JSX was rendered when `!isGenerating` previously — keep it identical.

- [ ] **Step 3: TypeScript + build check**

Run:
```
npx tsc --noEmit
npx vite build
```
Expected: both clean.

- [ ] **Step 4: Manual smoke test (instructions for the developer)**

Run `npm run dev` locally. Sign in, open an article, click Generate. Expect:
1. Skeleton + phase indicator appear immediately
2. Phase text changes after ~4s, ~12s, ~25s
3. Elapsed counter ticks up
4. When generation completes, skeleton disappears and the actual article content appears
5. No console errors about missing keys, hooks, or undefined props

If any step fails, fix before committing. **Do not skip this manual check** — unit tests don't catch UI regressions.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/content.tsx
git commit -m "client: phase + skeleton UI replaces token-streaming view

Time-driven phase indicators (Brainstorming → Drafting → Writing →
Polishing) over a fade-in skeleton outline. Final reveal happens when
/state.done arrives and article query refetches with the full content."
```

---

## Phase 7: Vercel waitUntil enhancement

### Task 13: Install `@vercel/functions` and wire `waitUntil`

**Files:**
- Modify: `package.json`
- Modify: `server/auth.ts:69-77` (the lazy-tick fire-and-forget)

- [ ] **Step 1: Install @vercel/functions**

Run: `npm install @vercel/functions`
Expected: package added to `dependencies`. The `package-lock.json` updates.

- [ ] **Step 2: Verify the package added**

Run: `grep "@vercel/functions" c:/Users/yoges/OneDrive/Desktop/venturecite/package.json`
Expected: `"@vercel/functions": "^...",`

- [ ] **Step 3: Update auth.ts to use waitUntil on Vercel**

Open `server/auth.ts`. Find the lazy-tick block (around line 69-77, fired right after `Sentry.setUser({...})`):

```ts
  // Lazy-eval workflow tick: replaces the 30s global cron (dropped for
  // serverless compat). Fire-and-forget so request latency is unaffected;
  // advanceRun is idempotent and the helper debounces per-user.
  maybeTickActiveRunsForUser(dbUser.id).catch((err) => {
    logger.warn({ err, userId: dbUser.id }, "auth: maybeTickActiveRunsForUser failed");
  });
```

Replace with:

```ts
  // Lazy-eval workflow tick: replaces the 30s global cron (dropped for
  // serverless compat). On Vercel we use waitUntil() so the tick runs
  // *after* the response is sent (zero added request latency), bounded
  // by maxDuration. On Render the .catch() promise is detached the
  // standard way. advanceRun is idempotent and the helper debounces.
  const tickPromise = maybeTickActiveRunsForUser(dbUser.id).catch((err) => {
    logger.warn({ err, userId: dbUser.id }, "auth: maybeTickActiveRunsForUser failed");
  });
  if (process.env.VERCEL) {
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(tickPromise);
  }
  // On non-Vercel, the promise is already running; nothing more to do.
```

The dynamic import keeps `@vercel/functions` out of the Render bundle's hot path.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

If `@vercel/functions` types aren't found, ensure `npm install` actually wrote `node_modules/@vercel/functions/`. The package exports `waitUntil` directly.

- [ ] **Step 5: Test**

Run: `npx vitest run`
Expected: `Tests 217 passed` (no regression).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/auth.ts
git commit -m "deps: add @vercel/functions; auth uses waitUntil on Vercel

Lazy-eval workflow tick now runs after the response is sent on Vercel
(bounded by maxDuration), not before. Render unchanged."
```

---

## Phase 8: UI labels for free-plan disclosures

### Task 14: Add free-plan disclosure to schedule-related UI

**Files:**
- Modify: `client/src/pages/citations.tsx` (Schedule tab)

The spec called for an honest "Scheduled jobs run once per day around 06:00 UTC" disclosure on UI affected by the Hobby cron limit. Confirm location.

- [ ] **Step 1: Find the auto-citation schedule UI**

Run: `grep -rn "autoCitationDay\|autoCitationHour\|autoCitationSchedule" c:/Users/yoges/OneDrive/Desktop/venturecite/client/src/`
Expected: ScheduleTab or equivalent component.

- [ ] **Step 2: Add a small notice near the hour-of-day picker**

Insert near the hour-of-day select control:

```tsx
<p className="mt-2 text-xs text-muted-foreground">
  ⓘ Scheduled jobs run once per day around 06:00 UTC. The hour-of-day
  selection is preserved for future plan upgrades.
</p>
```

Match the existing component's styling (use whatever Tailwind / shadcn primitives are nearby).

- [ ] **Step 3: Build check**

Run: `npx vite build`
Expected: clean.

- [ ] **Step 4: Manual visual check**

Run `npm run dev`, open the Citations page → Schedule tab. Verify the notice renders, doesn't shift layout, looks consistent with surrounding text.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/citations.tsx
git commit -m "ui: free-plan disclosure for sub-daily schedules

Honest labeling: the daily-only cron limit on Hobby means the per-brand
hour-of-day setting isn't enforced today. UI now says so explicitly."
```

---

## Phase 9: Final verification

### Task 15: Full verification + manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Full automated suite**

Run:
```
npx tsc --noEmit
npx vitest run
npm run lint
npx vite build
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
```

Expected:
- tsc clean
- vitest: `Tests 217 passed`
- lint: 0 errors
- vite build: success
- esbuild: success, `dist/index.js` produced

- [ ] **Step 2: Local dev smoke test (Render parity)**

```
npm run dev
```

Open a browser to `http://localhost:5000`. Without setting `VERCEL=1`:
1. Log in. ✓
2. Open an article. Click Generate. ✓ Phase + skeleton render.
3. Wait for completion (~30s). ✓ Article fades in, content matches the prompt.
4. Open the Citations page on a brand with prompts. Click Run now. ✓ Progress polls in.
5. Trigger a workflow if available. ✓ Steps progress.

If the article content is empty after generation: most likely `extractResponseText` doesn't match the actual SDK return shape. Add a `console.log(JSON.stringify(response, null, 2))` in the completed branch and check the structure.

- [ ] **Step 3: Vercel preview smoke test**

Push the branch to a Vercel preview deployment (this is the user's responsibility — outside the plan). On the preview:
1. Same five steps as above.
2. Specifically verify a long article (request 4000+ tokens) completes — proves the 60s ceiling is bypassed.
3. Close the tab during generation, reopen 60s later, confirm the article finished.

- [ ] **Step 4: Verify DB schema on prod target**

Run `npm run db:migrate` against the prod database (or the user does this as part of deploy). Confirm `content_generation_jobs.openai_response_id` column exists.

- [ ] **Step 5: No commit needed for verification**

Verification is a gate, not a code change. If everything passes, the implementation is complete.

If anything fails:
- Local issues → fix in subsequent commits
- Preview issues → triage on the preview before promoting to production
- DB schema issues → coordinate with the user; do not auto-rerun migrations

---

## Rollback procedure (if anything is wrong post-deploy)

The Responses API change is encapsulated in `runJobToCompletionOrDeadline` and `/state` route shape. To roll back:

1. `git revert <commit hash of Phase 4 Task 8>` — restores the Chat Completions streaming implementation.
2. `git revert <commit hash of Phase 5 Task 10>` — restores the old /state shape.
3. `git revert <commit hash of Phase 6 Task 11+12>` — restores the old client streaming UI.
4. The schema migration (`0045_content_job_openai_response.sql`) is non-destructive (adds a nullable column); no rollback needed. Future deploys can safely ignore the column.
5. Re-deploy.

This rollback is non-destructive: existing in-flight jobs would behave correctly under the old code path again, and articles already generated under the new code path are preserved in `articles.content` regardless of which generator wrote them.

---

## Spec coverage check (self-review)

Cross-checking against the spec sections:

| Spec section | Implemented in |
|---|---|
| Universal architecture (kickoff + /state + /advance) | Tasks 8-10 (slice runner is the same shape; route shape adapted) |
| Content gen via Responses background | Task 8 |
| Schema additions (`openai_response_id`) | Task 1 |
| /state response shape change | Tasks 9-10 |
| Phase + skeleton + reveal UX | Tasks 11-12 |
| Citation runs / onboarding / workflows unchanged | Verified by Task 15 Step 1 (existing tests) |
| Inactive scheduling (daily cron + lazy-eval augmentation) | Task 13 (waitUntil), Task 14 (UI label) |
| Idempotency contract | Task 8 (existing-response-id check; legacy detection) |
| Edge case behavior | Tasks 6-7 (failed/cancelled/legacy tests) |
| Critical files / migration / tests / verification | All phases |

No gaps identified.

---

## Plan complete

Plan saved to `docs/superpowers/plans/2026-05-03-vercel-hobby-single-path-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
