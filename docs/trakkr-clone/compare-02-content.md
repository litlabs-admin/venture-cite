# Compare 02 - content production and outbound actions

Scope: `server/routes/content.ts`, `contentTypes.ts`, `articles.ts`, `community.ts`, `buffer.ts`,
`publications.ts`, `server/contentGenerationWorker.ts`, and the client pages `content.tsx`,
`articles.tsx`, `act.tsx`, `community-engagement.tsx`.

Every statement below comes from the code. No `.md` file in this repo was used as evidence.

---

## 1. HTTP route inventory

### 1.1 `server/routes/content.ts` - `setupContentRoutes(app)`

| Method | Path | Returns | Tables touched |
|---|---|---|---|
| POST | `/api/articles/:id/generate` | `{ success, data: { jobId, status:"pending" } }` | `articles` (update), `content_generation_jobs` (insert), usage/quota rows |
| GET | `/api/content-jobs/active` | most recent in-flight job, else recent completed job, else `null` | `content_generation_jobs` |
| GET | `/api/content-jobs/:jobId` | id, status, articleId, errorMessage, errorKind, requestPayload, timestamps | `content_generation_jobs` |
| GET | `/api/content-jobs/:jobId/state` | `{ status, done, errorMessage, elapsedSeconds? }` | `content_generation_jobs` |
| POST | `/api/content-jobs/:jobId/advance` | `{ status, done, contentLength, errorKind, errorMessage }` | `content_generation_jobs`, `articles`, `article_revisions` |
| POST | `/api/content-jobs/:jobId/cancel` | `{ status:"cancelled" }` | `content_generation_jobs`, `articles` |
| POST | `/api/content/:articleId/cancel` | `{ status:"cancelled" }` or `{ noActiveJob:true }` | `articles`, `content_generation_jobs` |
| POST | `/api/articles/:id/improve` | `{ article, improvedContent }` | `articles`, `article_revisions` |
| POST | `/api/keyword-suggestions` | `{ suggestions: string[] }` (max 8) | none |
| GET | `/api/popular-topics` | `{ topics: [...] }` (max 8) | none |
| POST | `/api/keyword-research/discover` | `202` + `{ jobId, pollUrl }` | `llm_jobs`, later `keyword_research` |
| GET | `/api/keyword-research/:brandId` | keyword rows | `keyword_research` |
| GET | `/api/keyword-research/:brandId/opportunities` | top-N rows | `keyword_research` |
| PATCH | `/api/keyword-research/:id` | updated row | `keyword_research` |
| DELETE | `/api/keyword-research/:id` | `{ deleted }` | `keyword_research` |

Notes:

- `POST /api/articles/:id/generate` refuses any article not in `draft` or `failed`
  (`409`, `code:"invalid_status"`).
- The quota slot is reserved and the job row is inserted in one transaction.

```ts
// server/routes/content.ts:271-284
const tier = resolveTier(user as any) as Tier;
const jobId = await withArticleQuota(user.id, tier, async (tx) => {
  const [row] = await tx
    .insert(schema.contentGenerationJobs)
    .values({ userId: user.id, brandId: article.brandId, articleId: article.id,
              status: "pending", requestPayload: payload as never })
    .returning();
  return row.id;
});
```

- The route also starts a server-side drive loop with `waitUntil`, so a browser tab is not
  required for progress.

```ts
// server/routes/content.ts:305-324
const driveDeadlineMs = Date.now() + 50_000;
waitUntil((async () => {
  while (Date.now() < driveDeadlineMs) {
    const claimed = await storage.claimContentJobForSlice(jobId, 12);
    if (claimed) {
      const sliceDeadlineMs = Math.min(driveDeadlineMs, Date.now() + 10_000);
      const outcome = await runArticleSlice(jobId, sliceDeadlineMs);
      if (outcome.done) break;
    }
    await new Promise((r) => setTimeout(r, 4_000));
  }
})());
```

### 1.2 `server/routes/contentTypes.ts` - `setupContentTypesRoutes(app)`

| Method | Path | Returns | Tables |
|---|---|---|---|
| GET | `/api/listicles/:brandId` | listicle rows for one brand | `listicles` |
| GET | `/api/listicles` | rows across the caller's brands, optional `?brandId=` | `listicles` |
| POST | `/api/listicles` | created row, `409` if URL already tracked | `listicles` |
| PATCH | `/api/listicles/:id` | updated row | `listicles` |
| DELETE | `/api/listicles/:id` | `{ success }` | `listicles` |
| POST | `/api/listicles/discover/:brandId` | scan report, rows, tips | `listicles` |
| GET | `/api/wikipedia/:brandId` | mention rows | `wikipedia_mentions` |
| POST | `/api/wikipedia` | created row, `409` on duplicate page | `wikipedia_mentions` |
| POST | `/api/wikipedia/scan/:brandId` | scan report + mentions | `wikipedia_mentions` |
| POST | `/api/wikipedia/draft/:mentionId` | `{ draft, notes[] }` NPOV paste text | reads `wikipedia_mentions`, `brands`, fact sheet |
| GET | `/api/bofu-content/:brandId` | BOFU rows | `bofu_content` |
| GET | `/api/bofu-content` | rows across brands, `?contentType=` filter | `bofu_content` |
| POST | `/api/bofu-content` | created row | `bofu_content` |
| PATCH | `/api/bofu-content/:id` | updated row, syncs published URL | `bofu_content`, `tracked_content_urls` |
| DELETE | `/api/bofu-content/:id` | `{ success }` | `bofu_content`, `tracked_content_urls` |
| POST | `/api/bofu-content/generate` | generated + saved row, tips | `bofu_content` |
| GET | `/api/faqs/:brandId` | FAQ rows | `faq_items` |
| GET | `/api/faqs` | rows across brands, `?articleId=` filter | `faq_items` |
| POST | `/api/faqs` | created row | `faq_items` |
| PATCH | `/api/faqs/:id` | updated row, recomputes `aiSurfaceScore` | `faq_items`, `tracked_content_urls` |
| DELETE | `/api/faqs/:id` | `{ success }` | `faq_items`, `tracked_content_urls` |
| POST | `/api/faqs/:id/optimize` | rewritten FAQ, `isOptimized=1` | `faq_items` |
| POST | `/api/faqs/generate/:brandId` | `202` + `{ jobId, pollUrl }` | `llm_jobs`, later `faq_items` |
| GET | `/api/geo-tools/summary/:brandId` | header summary counts | GEO tool tables |

The listicle row carries an outreach lifecycle. The server validates the value but does not
force an order.

```ts
// server/routes/contentTypes.ts:197
const LISTICLE_OUTREACH_STATUSES = new Set(["new", "contacted", "won", "dropped"]);
```

### 1.3 `server/routes/articles.ts` - `setupArticlesRoutes(app)`

| Method | Path | Returns | Tables |
|---|---|---|---|
| POST | `/api/articles` | created article, forced `status:"ready"` | `articles` |
| POST | `/api/articles/draft` | created draft article | `articles` |
| GET | `/api/articles` | article list, `?status=` (`ready` default, comma list, or `all`), `?brandId=`, pagination | `articles` |
| GET | `/api/articles/:id` | one article | `articles` |
| PUT | `/api/articles/:id` | updated article, `409` on version conflict | `articles` |
| DELETE | `/api/articles/:id` | `{ success }`, cascade deletes revisions/distributions/rankings | `articles` |
| GET | `/api/articles/:id/revisions` | revisions newest first, limit ≤ 200 | `article_revisions` |
| GET | `/api/articles/:id/revisions/:revId` | one revision | `article_revisions` |
| POST | `/api/articles/:id/revisions/:revId/restore` | restored article, writes a `manual_edit` revision | `articles`, `article_revisions` |
| POST | `/api/distributions` | pending rows, max 10 platforms | `distributions` |
| GET | `/api/distributions/:articleId` | distribution rows | `distributions` |
| PATCH | `/api/distribute/entry/:distributionId` | updated row (`metadata.content`) | `distributions` |
| POST | `/api/distribute/:articleId` | per-platform result array, max 7 platforms | `distributions` |
| POST | `/api/distributions/:distributionId/buffer-post` | `{ platformPostId }`, sets row `status:"scheduled"` | `distributions`, `users` |
| POST | `/api/geo-rankings` | created ranking | `geo_rankings` |
| GET | `/api/geo-rankings` | rankings, optional `?articleId=` | `geo_rankings` |
| GET | `/api/geo-rankings/platform/:platform` | rankings for one AI platform | `geo_rankings` |

### 1.4 `server/routes/community.ts` - `setupCommunityRoutes(app)`

| Method | Path | Returns | Tables |
|---|---|---|---|
| GET | `/api/community-posts` | posts, filters `brandId`, `platform`, `status` | `community_posts` |
| POST | `/api/community-posts` | created post | `community_posts` |
| GET | `/api/community-posts/:id` | one post | `community_posts` |
| PATCH | `/api/community-posts/:id` | updated post, coerces `postedAt` | `community_posts` |
| DELETE | `/api/community-posts/:id` | `{ success }` | `community_posts` |
| POST | `/api/community-discover` | 10-15 community groups (AI, not persisted) | none |
| POST | `/api/community-generate` | `{ title, content, hashtags, tips, bestTimeToPost }` (not persisted) | none |

The discovery prompt only names two platforms.

```ts
// server/routes/community.ts:173-183
Return a JSON array of 10-15 community groups with this structure:
[{ "platform": "reddit" | "hackernews", ... }]
```

### 1.5 `server/routes/buffer.ts` - `setupBufferRoutes(app)`

| Method | Path | Returns | Tables |
|---|---|---|---|
| POST | `/api/buffer/connect` | `{ success }`, stores AES-256-GCM encrypted key | `users.bufferAccessToken` |
| GET | `/api/buffer/profiles` | `{ connected, data: channels[] }` | `users` |
| POST | `/api/buffer/post` | `{ postId }` | `users` |
| GET | `/api/buffer/status` | `{ connected: boolean }` | `users` |
| DELETE | `/api/buffer/connection` | `{ success }` | `users` |

Buffer uses a bring-your-own API key and the GraphQL endpoint, not OAuth.

```ts
// server/routes/buffer.ts:25
const BUFFER_GRAPHQL_ENDPOINT = "https://api.buffer.com";
```

Scheduling: `scheduledAt` produces `mode: customScheduled` with a `dueAt`; without it the post
goes to `mode: addToQueue` (comment at `server/routes/buffer.ts:197-201`).

### 1.6 `server/routes/publications.ts` - `setupPublicationsRoutes(app)`

The file name is stale. It holds no publication routes. It holds competitor routes.

| Method | Path | Returns | Tables |
|---|---|---|---|
| POST | `/api/competitors/discover/:brandId` | `{ inserted, competitors }` | `competitors` |
| GET | `/api/competitors/leaderboard` | leaderboard + `{ totalTracked, withActivity }` | `competitors`, citations |
| GET | `/api/competitors` | competitor rows | `competitors` |
| POST | `/api/competitors` | created row, forced `tier:"core"`, `discoveredBy:"manual"` | `competitors` |
| PATCH | `/api/competitors/:id` | updated row (name, domain, industry, tier, description, nameVariations) | `competitors` |
| GET | `/api/competitors/:id` | one row | `competitors` |
| DELETE | `/api/competitors/:id` | soft delete | `competitors` |
| POST | `/api/competitors/:id/ignore` | soft delete plus `is_ignored=1` | `competitors` |
| GET | `/api/competitors/:id/latest-citations` | latest citations | citation tables |

`/robots.txt` and `/sitemap.xml` are served from `client/public/`, not from this file
(comment at `server/routes/publications.ts:51-64`).

---

## 2. The content generation pipeline

### 2.1 Trigger

A user clicks **Generate Article** on the Content page. The client calls
`POST /api/articles/:id/generate` with `keywords`, `industry`, `type`, `contentStyle`,
`targetCustomers`, `geography` (`client/src/pages/content.tsx:447-454`).

A second, server-only entry exists: `enqueueContentGenerationJob(userId, brandId, payload)`
in `server/contentGenerationWorker.ts:397`. No caller exists in the current tree.

### 2.2 Queue

The route writes the form fields onto the article, reserves the quota, inserts a
`content_generation_jobs` row with `status:"pending"`, then flips the article to
`status:"generating"` and stores `jobId` on it (`server/routes/content.ts:254-295`).

### 2.3 Claim

There is no long-running polling worker. The header comment says so plainly.

```ts
// server/contentGenerationWorker.ts:435-440
// Vercel migration: the polling worker (initContentGenerationWorker, tick,
// nextDelayMs) and the older generateArticleForJob entry were removed.
// The /api/content-jobs/:jobId/advance route and the daily cron's drain
// step are the only callers of runArticleSlice; both wrap the slice with
// the per-job lock (last_advance_started_at)
```

Three drivers can run a slice:

1. The browser loop - `POST /advance` every 7 seconds, 8-second slice budget, 9-second lock.
2. The `waitUntil` server drive inside the generate route - 50-second window, 12-second lock.
3. The daily cron step `drain-pending-content-jobs` - one job per tick, 30-second lock
   (`server/routes/cron.ts:203-228, 299`).

The lock is `storage.claimContentJobForSlice(jobId, seconds)`. Only one slice runs at a time.

### 2.4 Writing

The first slice starts an OpenAI Responses run in background mode and stores the response id.
Later slices poll it.

```ts
// server/contentGenerationWorker.ts:136-147
const response = await openaiBreaker.run(() =>
  openai.responses.create({
    model: MODELS.contentGeneration as string,
    input: promptText,
    background: true,
    store: true,
  }),
);
await storage.updateContentJobResponseId(job.id, response.id);
```

One LLM call per article. No continuation prompts. No token streaming.

**Which model writes it:** `MODELS.contentGeneration`, which is
`OPENAI_MINI_SNAPSHOT = "gpt-4o-mini-2024-07-18"` (`server/lib/modelConfig.ts:19, 47`).
Auto-Improve uses `MODELS.contentHumanize` - the same snapshot. Distribution copy uses
`MODELS.distribution` - also the same snapshot.

The prompt is built by `buildContentPrompt` (`server/contentGenerationWorker.ts:214-260`).
It layers a GEO system preamble, brand facts, audience, and a B2B/B2C style directive.

### 2.5 Result

On `status === "completed"` the code extracts the text, records token spend, derives the title
from the first `# ` heading, and writes both the article and a revision.

```ts
// server/contentGenerationWorker.ts:174-182
const headingMatch = finalContent.match(/^#\s+(.+)$/m);
const title = headingMatch?.[1]?.trim() || `${keywords} - ${industry}`;
await storage.setArticleReady(articleId, finalContent, title);
await storage.createRevision({ articleId, content: finalContent,
  source: "generated", createdBy: "system" });
```

### 2.6 Failure and refund

`classifyError` maps a throw to one of `budget`, `circuit`, `openai_429`, `openai_5xx`,
`timeout`, `unknown` (`server/contentGenerationWorker.ts:60-70`). The job is marked failed,
the article is set to `failed`, and `refundArticleQuota` returns the quota slot.
OpenAI-side `failed`, `incomplete`, and empty output are all re-thrown with `name="TimeoutError"`
so they classify as refundable.

Job states: `pending`, `running`, `succeeded`, `failed`, `cancelled`.
Article states: `draft`, `generating`, `ready`, `failed`.

---

## 3. Every content type the system can produce

Exact strings from the code.

**Article content types** (Content page select, `client/src/pages/content.tsx:1081-1084`):

- `article`
- `blog post`
- `product description`
- `social media post`

The worker's length map keys are capitalised and therefore never match those lowercase values;
every request falls through to the default (`server/contentGenerationWorker.ts:234-240`):

```ts
const contentTypePrompts: Record<string, string> = {
  Article: "comprehensive article (1500-2000 words)",
  "Blog Post": "in-depth blog post (1200-1500 words)",
  "Product Description": "detailed product guide (800-1000 words)",
  "Social Media Post": "engaging social media content series (500-700 words total)",
};
const promptType = contentTypePrompts[type] || "comprehensive content (1500+ words)";
```

**Content style:** `b2c`, `b2b`.

**BOFU content types** (`server/routes/contentTypes.ts:671-741`):

- `comparison` - "X vs Y: Complete Comparison Guide"
- `alternatives` - "Top X Alternatives"
- `guide` - buying guide

Anything else returns `400 Invalid content type`.

**Other produced artefacts:**

- FAQ items (`faq_items`), single-item optimize and bulk generate.
- Wikipedia mention draft text (NPOV, 2-3 sentences, max ~80 words).
- Listicle rows (discovered, not written).
- Community posts - post types `post`, `answer`, `comment`; platforms `reddit`, `hackernews`.
- Distribution copy - `LinkedIn`, `Twitter`, `Facebook`, `Instagram`, `Medium`, `Reddit`
  (`client/src/components/articles/DistributeDialog.tsx:31`).
- Keyword rows with `suggestedContentType` values `article | guide | comparison | how-to | listicle`
  (`server/routes/content.ts:897`).

---

## 4. Publishing and distribution paths

**Path A - AI reformat, then manual copy.** `POST /api/distribute/:articleId` runs one LLM call
per platform in parallel, each with a platform-specific prompt and hard length constraint
(Twitter ≤ 280, Facebook ≤ 2000, Instagram ≤ 2200 with a 125-character hook). Each result is
stored in a `distributions` row as `metadata.content` with `status:"success"`.

**Path B - Buffer.** Only `LinkedIn`, `Twitter`, `Facebook`, `Instagram` are Buffer-eligible
(`DistributeDialog.tsx:33`). `POST /api/distributions/:distributionId/buffer-post` sends the saved
copy to Buffer and stamps the row.

```ts
// server/routes/articles.ts:615-621
const result = await postToBuffer(user.id, channelId, content);
if (result.ok) {
  await storage.updateDistribution(distribution.id, {
    platformPostId: result.postId, status: "scheduled", distributedAt: new Date(),
  });
```

**Scheduling.** `POST /api/buffer/post` accepts `scheduledAt`. The per-distribution route does
not pass it, so distribution posts always go to the Buffer queue.

**Path C - manual URL tracking.** BOFU and FAQ rows accept `publishedUrl` and `publishedAt`.
A PATCH that touches `publishedUrl` upserts or deletes a `tracked_content_urls` row
(`server/routes/contentTypes.ts:155-175`).

**Path D - community.** Nothing is posted. The user copies the text and marks the row `posted`.

There is no CMS publishing. No WordPress, Webflow, Shopify, or Ghost path exists in this slice.

---

## 5. The "action" or task concept

Two separate things exist.

**5.1 `agent_tasks` table.** Columns include `taskType`, `taskTitle`, `taskDescription`,
`priority` (`low|medium|high|urgent`), `status` (`queued|in_progress|completed|failed|cancelled`),
`assignedTo`, `triggeredBy` (`manual|cron|chained`), `inputData`, `outputData`, `retryCount`,
`maxRetries`, `artifactType`, `artifactId`, `workflowRunId` (`shared/schema.ts:1539-1586`).

It has DAO methods (`server/databaseStorage.ts:3453-3486`) and an executor
(`server/lib/agentTaskExecutor.ts:32`). **It has no HTTP route and no client page.** A grep for
`agent-tasks` or `agentTask` across `server/routes/` and `client/src/` returns nothing. The only
writer is `server/lib/workflowEngine.ts:340`. A user cannot see, create, or complete an agent task.

**5.2 `workflow_runs`.** One workflow is registered.

```ts
// server/lib/workflows/registry.ts:4
export const ALL_WORKFLOWS: WorkflowDefinition[] = [weeklyCatchupWorkflow];
```

Key `weekly_catchup`, with steps `citation_check` (task type `prompt_test`), `delta_calc`,
`hallucination_scan`, `compose_digest`, `send_digest_email`. Runs advance lazily on user login
(`maybeTickActiveRunsForUser` in `server/auth.ts:14`) and by the scheduler
(`server/scheduler.ts:18`).

**5.3 The only user-completable action-like states in this slice:**

- Listicle `outreachStatus`: `new`, `contacted`, `won`, `dropped`. The user sets it by PATCH.
  The server rejects any other value but allows any transition.
- Community post `status`: `draft`, `ready`, `posted`. The user completes one with the
  "Mark as posted" button, which PATCHes `status:"posted"` plus `postedAt`
  (`client/src/pages/community-engagement.tsx:205-211`).
- Article `status`: `draft`, `generating`, `ready`, `failed`.
- Distribution `status`: `pending`, `success`, `failed`, `scheduled`.

There is no queue page, no priority sorting, no "top job" card, and no pipeline view.

---

## 6. User-visible features on the assigned client pages

### 6.1 `/act` (`client/src/pages/act.tsx`)

A six-tab spine shell. Default tab `create`.

| Tab value | Label | Component |
|---|---|---|
| `create` | Create | `pages/content` |
| `library` | Library | `pages/articles` |
| `keywords` | Keywords | `pages/keyword-research` |
| `geo-assets` | GEO Assets | `pages/geo-tools` |
| `faq` | FAQ | `pages/faq-manager` |
| `community` | Community | `pages/community-engagement` |

### 6.2 Content page (`client/src/pages/content.tsx`)

Route-driven single-article editor. Mounted at `/content`, `/content/:articleId`, and embedded
at `/act?tab=create&article=<id>`. Bare `/content` either loads the newest draft or creates a new
one. Seed params `?keyword=&industry=&type=&brandId=` force a fresh pre-filled draft.

Three render states driven by `article.status`:

- **`draft` / `failed`** - the Draft Form.
- **`generating`** - a status dot, `Generating (Ns)` elapsed counter, a **Cancel** button, and a
  skeleton. The old fake phase labels were removed; the header comment says the labels were
  "fake theatre uncorrelated with actual model progress".
- **`ready`** - `ReadyEditor`: title, AI-generated pill, **Open in Articles** link, a
  `MarkdownEditor`, and auto-save.

Draft Form controls:

- Brand combobox, Target Industry combobox (with a note when it differs from the brand's).
- Keyword chips plus a **Suggest** button hitting `/api/keyword-suggestions`; each suggestion
  chip toggles in and out.
- Content Type select (four values, section 3).
- Content Style - two large B2C / B2B buttons.
- A collapsible **Target Audience & Geography** block with a "Pull from brand" shortcut.
- **Generate Article** button, disabled without a brand, an industry, and at least one keyword,
  or when the monthly quota is exhausted.
- A **Popular Topics in <industry>** panel with a Refresh button; clicking a topic adds it as a
  keyword.

Also on the page: `DraftToolbar` (draft picker, New Article, Delete draft), `BeginnerTips`,
`UsageWidget`, and a delete-confirmation alert dialog.

Polling: `/state` every 1s while visible (4s when hidden), `/advance` every 7s while visible.

### 6.3 Articles page (`client/src/pages/articles.tsx`)

Card list, not a table.

- **Status filter**: `Ready`, `Drafts & failures` (`draft,generating,failed`), `Generating`,
  `Failed`, `All`.
- **Brand filter** (only when more than one brand exists).
- **Sort**: Newest first, Oldest first, Title (A-Z).
- Free-text search over title, excerpt, and keywords.
- Checkbox selection, select-all-on-page, bulk delete with confirmation.
- Paging: 12 per page, "Load N more" button.
- Each card shows title, AI-generated pill, status badge, derived excerpt, brand chip, relative
  date with an exact-date tooltip, view count, industry, first 5 keywords plus a "+N more" tooltip.
- Row buttons: **View / Edit** always; **Generate Platform Copy** when `ready`;
  **Continue draft** when `draft`; **Retry generation** when `failed`; **Delete**.

`ViewEditDialog` (`client/src/components/articles/ViewEditDialog.tsx`) holds three tabs:

- **View** - sanitised markdown render.
- **Edit** - title field, split-pane markdown editor, **Auto-Improve** (with an inline before/after
  diff and Discard/Keep buttons), **Save** with `expectedVersion`.
- **Versions** - revision list by source badge and relative time, a diff against current content,
  and **Restore this version**.

A `409` from save, improve, or restore opens a conflict modal offering "Reload latest" or
"Force-save my changes".

`DistributeDialog` holds three views:

- **Generate New** - six platform checkboxes, one Generate button.
- **Results** - one card per platform with Copy, Edit, and a Buffer post button on the four
  Buffer-eligible platforms.
- **History** - past successful or scheduled distributions.

A banner at the top shows Buffer connection state and the channel count.

### 6.4 Community page (`client/src/pages/community-engagement.tsx`)

- Top bar: **Discover Communities** and a **Generate Post** dialog trigger. Both need a selected
  brand.
- Three tabs: **Discover**, **Drafts (n)**, **Posted (n)**.
- Discover tab: four KPI tiles - Groups Found, Draft Posts, Posted, Platforms Active. Then group
  cards with platform icon, member count, relevance badge, description, suggested approach, and
  topic-idea chips. Row buttons: **Visit**, **Write Post** (pre-fills the generate form),
  **Save** (stores it as a draft post).
- Generate dialog: Platform (Reddit, Hacker News), Post Type (New Post, Answer/Reply, Comment),
  Community/Group Name, Topic, Tone (four options). The result panel shows title, content,
  posting tips, best time to post, plus **Copy** and **Save as Draft**.
- Drafts tab: per-card Edit (dialog with title and content), Copy, **Mark as posted**, Delete.
- Posted tab: read-only cards with a "View post" external link and the posted date.
- A static "Community Engagement Best Practices" panel for Reddit and Hacker News.

Discovered groups are held in React state only. They are never persisted unless the user
clicks Save.

---

## 7. Mapping to Trakkr

Trakkr sections used: 4.2 Actions `/actions`, 4.12 Content `/create`, 4.16 Automations
`/automations`.

### 7.1 Against Trakkr 4.2 - Actions

| VentureCite feature | Trakkr counterpart | Verdict | Exact difference |
|---|---|---|---|
| `agent_tasks` table with status `queued/in_progress/completed/failed/cancelled` and priority | Action row, pipeline `found → planned → measuring → earned` | **WEAKER** | The venturecite table is unreachable. No HTTP route and no client page reference it. Trakkr exposes a full page with rows, filters, and a detail drawer. |
| Listicle `outreachStatus` (`new/contacted/won/dropped`) | Action pipeline states | **WEAKER** | Four states on one artefact type only, edited by PATCH. Trakkr has one pipeline across every job type. |
| Community post `status` (`draft/ready/posted`) with Mark-as-posted | Action completion | **WEAKER** | Manual self-report on community posts only. No measurement step, so nothing corresponds to Trakkr's `measuring` and `earned` rungs. |
| Article `status` (`draft/generating/ready/failed`) | Action row | **WEAKER** | Tracks a generation job, not a piece of work that raises a score. |
| — | `/actions?actionId=<uuid>` drawer with Brief, Steps, Agent, Activity tabs | **ABSENT IN VENTURECITE** | No action drawer exists. |
| — | Controls: This week, Results, Open, Type, Learning, New action, Export, Columns and density | **ABSENT IN VENTURECITE** | No actions surface, so no controls. |
| — | Rows written by `/diagnose` fixes and `/optimize` findings | **ABSENT IN VENTURECITE** | Nothing in this slice writes a work item from a diagnosis. |

### 7.2 Against Trakkr 4.12 - Content `/create`

| VentureCite feature | Trakkr counterpart | Verdict | Exact difference |
|---|---|---|---|
| Content page draft form → generated article | "Turn a visibility gap into an article" | **WEAKER** | The venturecite input is a keyword the user types, or a keyword handed over from the Keyword Research page. It is not a measured visibility gap. |
| Articles page card list with status, brand, sort, search, bulk delete | Drafts tab | **STRONGER** | Venturecite adds bulk delete, brand filter, three sorts, free-text search, and a "+N more" keyword overflow. Trakkr's Drafts tab is not documented to hold those. |
| `ViewEditDialog` with View / Edit / Versions, Auto-Improve, diff, restore, optimistic-lock conflict modal | Editor at `/content/articles/<id>` | **STRONGER** | Trakkr documents an editor route only. Venturecite adds full revision history, a per-revision diff, restore, and a documented `409` conflict-resolution flow. |
| `POST /api/keyword-research/discover`, `GET /api/keyword-research/:brandId/opportunities` | Ideas tab (IDEA, SIGNAL, POTENTIAL, AI VOL) | **WEAKER** | Venturecite scores keywords with LLM guesses. `provenance: "ai-estimate"` is stamped on every row (`server/routes/content.ts:138`). Trakkr's AI VOL column comes from its own measurement. |
| Popular Topics panel | Ideas tab | **WEAKER** | Topic list from one LLM call with a hard-coded single-entry fallback. No signal, no potential, no volume. |
| — | Tabs: Ideas, Drafts, Live, Campaigns | **PARTIAL** | Venturecite has Drafts (Articles page) and Ideas (Keywords tab). There is no **Live** tab - nothing tracks a published article's live state on the Articles page. There is no **Campaigns** concept anywhere in this slice. |
| — | Settings dialog with nine sections (identity, voice, messaging, audience, templates, knowledge, destinations, site index, agent automation) | **ABSENT IN VENTURECITE** | Content settings are per-draft form fields, not a saved brand-wide content profile. Content style is one binary choice (`b2b`/`b2c`). |
| — | Agent automation with 13 signals and 9 manual triggers | **ABSENT IN VENTURECITE** | No signal-driven content triggers exist. |
| BOFU generator (`comparison`, `alternatives`, `guide`) grounded on the brand fact sheet | Not documented in Trakkr | **STRONGER** | Trakkr's `/create` is documented as one article path. Venturecite adds three bottom-of-funnel formats with verified-fact grounding rules and per-competitor blocks. |
| FAQ generator plus per-item optimize with a deterministic `aiSurfaceScore` | Not documented in Trakkr | **STRONGER** | No Trakkr equivalent in 4.12. |
| Wikipedia scan plus NPOV draft helper | Not documented in Trakkr | **STRONGER** | No Trakkr equivalent. |
| Listicle discovery and tracker | Trakkr `/citations?view=outreach` (section 4.7) | **WEAKER** | Both track "cites your rival, not you" targets and both use New/Contacted/Won. Trakkr also drafts a pitch for each publisher and groups by Publisher, Prompt, or Competitor. Venturecite offers no pitch draft and no grouping. |
| Distribution to six social platforms plus Buffer posting | Not documented in Trakkr | **STRONGER** | Trakkr 4.12 documents no social distribution. |
| Community engagement (Reddit and Hacker News drafting and tracking) | Trakkr `/reddit` (section 4.15) | **STRONGER** | Trakkr's Reddit feature needs Reddit credentials and was never started on the observed account. Venturecite works with no credentials, but only because it never posts - the user copies and pastes. |

### 7.3 Against Trakkr 4.16 - Automations

| VentureCite feature | Trakkr counterpart | Verdict | Exact difference |
|---|---|---|---|
| `weekly_catchup` workflow: citation check → delta calc → hallucination scan → compose digest → send email | Rule shape WATCH → CHECK → ACT → TELL | **WEAKER** | One hard-coded workflow in `ALL_WORKFLOWS`. It is a fixed pipeline, not a rule the user builds. Its ACT step only composes and sends a digest. |
| Daily cron orchestrator steps (`drain-pending-content-jobs`, stuck-job reaper, orphan reconcilers) | Automations | **ABSENT IN TRAKKR** as a user feature | These are internal maintenance jobs. No user sees or configures them. Trakkr's automations are user-authored. |
| — | Four ready patterns: Citation guard, Comparison watcher, Weekly digest, Crawler health | **PARTIAL** | Only Weekly digest has an analogue (`weekly_catchup`). The other three are absent. |
| — | Autonomy ladder of five rungs | **ABSENT IN VENTURECITE** | No autonomy control exists. `agent_tasks.assignedTo` defaults to `"agent"` and is never read by a UI. |
| — | 17 triggers | **ABSENT IN VENTURECITE** | Triggers are `manual`, `cron`, `chained` only (`shared/schema.ts:1553`). |
| — | Rule builder; nothing runs until you review it and turn it on | **ABSENT IN VENTURECITE** | No builder, no review, no on/off switch. |
| Buffer scheduled post (`mode: customScheduled` with `dueAt`) | Automations ACT step | **WEAKER** | A single scheduled post, driven by the user each time. Not a rule. |

---

## 8. Trakkr features in this area that VentureCite does not have

1. **An Actions page.** No route, no table, no rows, no filters, no export, no column and density
   controls. The `agent_tasks` table exists but is unreachable from HTTP and from the client.
2. **The `found → planned → measuring → earned` pipeline.** Venturecite has no `measuring` or
   `earned` concept. Nothing measures whether a published piece raised a score.
3. **The action detail drawer** with Brief, Steps, Agent and Activity tabs, and the
   `/actions?actionId=<uuid>` deep link.
4. **Fixes that become actions.** Trakkr's `/diagnose` and `/optimize` write rows into `/actions`.
   Venturecite has no equivalent write path.
5. **A "New action" button.** A user cannot create a work item.
6. **The Content Live tab.** Nothing on the Articles page tracks a published URL for an article.
   `externalUrl` is a write-allowed field but no UI in this slice sets or shows it.
7. **Campaigns.** No grouping of ideas or drafts under a campaign name.
8. **The content settings dialog** with nine sections. Venturecite has no saved voice, messaging,
   template, knowledge, destination, or site-index configuration for content.
9. **Signal-driven content generation.** Trakkr's agent automation offers 13 signals and 9 manual
   triggers. Venturecite generation is always started by hand.
10. **A rule builder** with WATCH, CHECK, ACT and TELL, the five-rung autonomy ladder, and the
    17 triggers.
11. **The three non-digest automation patterns**: Citation guard, Comparison watcher, Crawler
    health.
12. **The review-before-enable gate.** Venturecite's `weekly_catchup` has no user-facing switch in
    this slice.
13. **Outreach pitch drafting.** Trakkr drafts a pitch per publisher. Venturecite's listicle
    tracker records an outreach status but writes no pitch.
14. **CMS publishing.** Trakkr integrates WordPress, Shopify, Webflow and Ghost. Venturecite's only
    outbound write is Buffer, and only for four social platforms.

---

## 9. Notable code facts worth flagging

1. The content-type prompt map never matches. The UI sends `"article"`; the map keys are
   `"Article"`. Every generation uses the generic 1500+ word fallback
   (`server/contentGenerationWorker.ts:234-240` against `client/src/pages/content.tsx:1081`).
2. `server/routes/publications.ts` contains no publication routes. It is the competitor module.
3. `agent_tasks` is dead from the user's point of view. Table, DAO and executor exist; no route
   and no page reference it.
4. Every article, every Auto-Improve pass, every FAQ, every BOFU piece and every distribution
   rewrite runs on `gpt-4o-mini-2024-07-18`.
5. `POST /api/community-discover` and `POST /api/community-generate` persist nothing. The results
   live in React state until the user clicks Save.
6. `GET /api/geo-rankings` without `articleId` loads every article in the database, then filters
   in JavaScript (`server/routes/articles.ts:682-688`). The same pattern appears in
   `/api/geo-rankings/platform/:platform`.
