# Verified findings register

Findings raised: 418
Sent to verification (critical and high): 127
Confirmed: 105   Refuted: 22   Uncertain: 0
Not verified (medium and low, kept as unverified claims): 291

Confirmed by severity after correction: critical 1, high 36, medium 50, low 18
Severity changed by the verifier: 68 down, 2 up

## Confirmed

Each row survived an agent whose task was to refute it.

| # | Severity | File | Line | Category | Agents | Reachable path |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | critical | `client/src/hooks/use-auth.ts` | 27 | security | 1 | client/src/hooks/use-auth.ts:19-31 -> src/routes/-shared/routeGates.tsx:51-61 -> client/sr |
| 2 | high | `server/scheduler.ts` | 208 | security | 2 | account deletion at `server/routes/userAccount.ts:212-220` -> selector at `server/schedule |
| 3 | high | `server/scheduler.ts` | 39 | availability | 2 | Sunday orchestrator call at `server/routes/cron.ts:502-504` -> `Orchestrator.run` at `serv |
| 4 | high | `client/src/hooks/useArticleAutoSave.ts` | 48 | correctness | 2 | client/src/pages/content.tsx:346-366 -> client/src/hooks/useArticleAutoSave.ts:85-98 -> cl |
| 5 | high | `client/src/hooks/useArticleAutoSave.ts` | 34 | concurrency | 2 | client/src/pages/content.tsx:346-359 -> client/src/hooks/useArticleAutoSave.ts:85-90 -> cl |
| 6 | high | `client/src/hooks/useScrapeRunStream.ts` | 191 | availability | 2 | GET stream at server/routes/factSheet.ts:202 -> reader ends at client/src/hooks/useScrapeR |
| 7 | high | `server/lib/factAgent/v2/factScrapeBackstop.ts` | 58 | concurrency | 2 | Full scrape takes job_leases at server/lib/factAgent/v2/runFullScrape.ts:159-163 -> stale  |
| 8 | high | `server/lib/wikipediaScanner.ts` | 58 | availability | 2 | POST /api/wikipedia/scan/:brandId at server/routes/contentTypes.ts:443 -> await scanBrandW |
| 9 | high | `client/src/pages/internal/Board.tsx` | 45 | concurrency | 1 | local change at `client/src/pages/internal/Board.tsx:100-107` -> full PUT at `client/src/p |
| 10 | high | `client/src/pages/internal/Board.tsx` | 34 | data persistence | 1 | empty PUT at `server/routes/board.ts:117-123` -> GET at `server/routes/board.ts:96-101` -> |
| 11 | high | `server/auth.ts` | 44 | correctness | 1 | server/routes.ts:80 -> server/auth.ts:262-286 -> server/routes.ts:88 -> server/auth.ts:252 |
| 12 | high | `server/scheduler.ts` | 194 | correctness | 1 | selector at `server/scheduler.ts:204-215` -> auto-citation loop at `server/scheduler.ts:22 |
| 13 | high | `server/citationChecker.ts` | 322 | correctness | 1 | `POST /api/brand-prompts/:brandId/run` at `server/routes/prompts.ts:1072` -> kickoff at `s |
| 14 | high | `server/citationChecker.ts` | 461 | correctness | 1 | `POST /api/brand-prompts/:brandId/run` at `server/routes/prompts.ts:1073` -> row creation  |
| 15 | high | `client/src/hooks/useChatbot.ts` | 279 | correctness | 1 | `client/src/components/chatbot/MessageBubble.tsx:86-92` -> `client/src/components/Educatio |
| 16 | high | `client/src/components/ui/toaster.tsx` | 11 | correctness | 1 | client/src/hooks/use-toast.ts:137-163 -> client/src/hooks/use-toast.ts:124-132 -> client/s |
| 17 | high | `client/src/hooks/useChatbot.ts` | 182 | correctness | 1 | `client/src/hooks/useChatbot.ts:279-285` -> `client/src/hooks/useChatbot.ts:182-203` -> `s |
| 18 | high | `client/src/hooks/use-auth.ts` | 34 | security | 1 | client/src/hooks/use-auth.ts:34-41 -> network failure at client/src/hooks/use-auth.ts:36 - |
| 19 | high | `client/src/pages/geo-signals.tsx` | 496 | data integrity | 1 | `ArticleSelect` at `client/src/pages/geo-signals.tsx:734-747` -> optimize click at `client |
| 20 | high | `server/citationChecker.ts` | 437 | usage limit enforcement | 1 | `POST /api/brand-prompts/:brandId/run` at `server/routes/prompts.ts:1072` -> budget check  |
| 21 | high | `server/citationChecker.ts` | 1252 | run status correctness | 1 | `POST /api/brand-prompts/:brandId/run` at `server/routes/prompts.ts:1072` -> failed fetch  |
| 22 | high | `server/citationChecker.ts` | 617 | resume correctness | 1 | failed row at `server/citationChecker.ts:1116-1139` -> `POST /citation-runs/:runId/advance |
| 23 | high | `server/databaseStorage.ts` | 3425 | correctness | 1 | server/routes/factSheet.ts:465-488 -> server/databaseStorage.ts:3946-3953 -> server/routes |
| 24 | high | `server/databaseStorage.ts` | 3885 | correctness | 1 | server/routes/intelligence.ts:359-383 -> server/routes/factSheet.ts:554-576 -> server/data |
| 25 | high | `server/lib/aiLogger.ts` | 29 | security | 1 | citationChecker.ts:26-31 -> aiLogger.ts:24-42 -> stdout request and response data. |
| 26 | high | `server/lib/factAgent/v2/runFullScrape.ts` | 356 | data loss | 1 | server/routes/factSheetV2.ts:566 -> server/lib/factAgent/v2/runFullScrape.ts:357 -> server |
| 27 | high | `server/lib/factAgent/v2/sourceStatic.ts` | 145 | availability | 1 | server/routes/factSheetV2.ts:179-196 -> server/lib/factAgent/v2/sourceStatic.ts:145-154 -> |
| 28 | high | `server/lib/llmJobs.ts` | 308 | concurrency | 1 | server/routes/llmJobs.ts:58 -> server/lib/llmJobs.ts:189 -> server/lib/llmJobs.ts:349 -> s |
| 29 | high | `server/lib/onboardingAutopilot.ts` | 289 | concurrency | 1 | server/lib/onboardingAutopilot.ts:434 -> server/lib/onboardingAutopilot.ts:289 -> server/l |
| 30 | high | `server/lib/ssrf.ts` | 277 | security | 1 | server/lib/factAgent/v2/runFullScrape.ts:171 -> server/lib/factAgent/v2/runFullScrape.ts:1 |
| 31 | high | `server/routes/content.ts` | 747 | resource control | 1 | server/routes.ts:80-88 -> server/routes/content.ts:747-749 -> server/routes/content.ts:773 |
| 32 | high | `server/scheduler.ts` | 65 | privacy | 1 | account deletion at `server/routes/userAccount.ts:212-220` -> report user query at `server |
| 33 | high | `server/routes/prompts.ts` | 1086 | correctness | 1 | POST /api/brand-prompts/:brandId/run at server/routes/prompts.ts:1073 -> kickoffBrandPromp |
| 34 | high | `server/routes/prompts.ts` | 170 | concurrency | 1 | Two POST requests to server/routes/prompts.ts:151 read nine tracked prompts at line 170 -> |
| 35 | high | `server/routes/userAccount.ts` | 86 | data handling | 1 | client/src/pages/settings.tsx:887 -> GET /api/user/export -> server/routes.ts:88 -> server |
| 36 | high | `server/routes/onboarding.ts` | 159 | correctness | 1 | client/src/pages/welcome.tsx:333 -> POST /api/onboarding/scrape-stream -> server/routes.ts |
| 37 | high | `tests/unit/citationChecker.kickoff.test.ts` | 1 | correctness | 1 | server/routes/prompts.ts:1113 -> server/citationChecker.ts:1358 -> server/citationChecker. |
| 38 | medium | `server/routes/mentions.ts` | 386 | unspecified | 3 | Register submit, `register.tsx:89` -> success handler, `register.tsx:59` -> session write, |
| 39 | medium | `client/src/hooks/useChatbot.ts` | 66 | concurrency | 2 | `client/src/components/EducationAssistant.tsx:271-280` -> `client/src/components/chatbot/H |
| 40 | medium | `client/src/hooks/useMentions.ts` | 30 | correctness | 2 | `client/src/components/geo-tools/MentionsFilters.tsx:238-250` -> `client/src/hooks/useMent |
| 41 | medium | `client/src/pages/community-engagement.tsx` | 263 | concurrency | 2 | Generate for brand A at client/src/pages/community-engagement.tsx:247-257 -> state stores  |
| 42 | medium | `client/src/pages/faq-manager.tsx` | 232 | correctness | 2 | POST /api/faqs at server/routes/contentTypes.ts:838 -> createFaqItem without aiSurfaceScor |
| 43 | medium | `server/routes/billing.ts` | 208 | correctness | 2 | GET /api/stripe/products at server/routes/billing.ts:196 -> all active prices append at li |
| 44 | medium | `tests/unit/citationCronUnconditional.test.ts` | 28 | 5 | 2 | Register submit, `register.tsx:89` -> success handler, `register.tsx:59` -> session write, |
| 45 | medium | `client/src/pages/register.tsx` | 17 | unspecified | 1 | Register submit, `register.tsx:89` -> success handler, `register.tsx:59` -> session write, |
| 46 | medium | `server/env.ts` | 80 | configuration | 1 | Dev startup, `server/index.ts:15` -> app import, `server/app.ts:20` -> parser, `server/env |
| 47 | medium | `client/src/components/ScanCompletionListener.tsx` | 64 | correctness | 1 | Completed scan, `ScanCompletionListener.tsx:57` -> View action, `ScanCompletionListener.ts |
| 48 | medium | `client/src/components/articles/ViewEditDialog.tsx` | 93 | correctness | 1 | Article save, `ViewEditDialog.tsx:93` -> request error, `queryClient.ts:68` -> mutation er |
| 49 | medium | `client/src/components/citations/PromptsTab.tsx` | 75 | correctness | 1 | Archive last tracked prompt -> `citations.tsx:374` sets false -> `PromptsTab.tsx:242` retu |
| 50 | medium | `client/src/components/citations/PromptsTable.tsx` | 384 | correctness | 1 | Bulk Archive, `PromptsTable.tsx:400` -> row loop, `PromptsTable.tsx:401` -> state replacem |
| 51 | medium | `client/src/hooks/useMentions.ts` | 271 | correctness | 1 | `server/routes/mentions.ts:396-403` -> `client/src/hooks/useMentions.ts:294-305` -> `clien |
| 52 | medium | `client/src/components/geo-tools/MentionsFilters.tsx` | 238 | correctness | 1 | `client/src/components/geo-tools/MentionsFilters.tsx:240` -> `client/src/hooks/useMentions |
| 53 | medium | `client/src/components/geo-tools/MentionsFilters.tsx` | 161 | correctness | 1 | `client/src/components/geo-tools/MentionsFilters.tsx:173-179` -> `client/src/hooks/useMent |
| 54 | medium | `client/src/components/geo-tools/ScanStatusPanel.tsx` | 141 | correctness | 1 | client/src/components/geo-tools/MentionsTab.tsx:366 -> client/src/hooks/useMentions.ts:317 |
| 55 | medium | `client/src/components/geo-tools/BofuContentSheet.tsx` | 142 | validation | 1 | client/src/pages/geo-tools.tsx:1106-1112 -> client/src/components/geo-tools/BofuContentShe |
| 56 | medium | `client/src/components/perception/ProbeMatrix.tsx` | 74 | correctness | 1 | `server/lib/perceptionProbes.ts:257-264` -> `server/routes/dashboard.ts:1709-1737` -> `cli |
| 57 | medium | `client/src/components/prompts/PromptsTable.tsx` | 464 | correctness | 1 | client/src/components/prompts/PromptsTable.tsx:450-468 -> client/src/components/prompts/Pr |
| 58 | medium | `client/src/hooks/useChatbot.ts` | 42 | correctness | 1 | `client/src/components/EducationAssistant.tsx:77-80` -> `client/src/hooks/useChatbot.ts:42 |
| 59 | medium | `client/src/hooks/useChatbot.ts` | 161 | concurrency | 1 | `client/src/components/chatbot/HistoryView.tsx:119-124` -> `client/src/components/Educatio |
| 60 | medium | `client/src/pages/brands.tsx` | 232 | correctness | 1 | client/src/pages/brands.tsx:316-320 -> client/src/pages/brands.tsx:218-245 -> server/route |
| 61 | medium | `client/src/pages/crawler-check.tsx` | 74 | correctness | 1 | src/routes/_app/diagnose.tsx:9-12 -> client/src/pages/diagnose.tsx:15 -> client/src/pages/ |
| 62 | medium | `client/src/pages/content.tsx` | 532 | correctness | 1 | client/src/pages/content.tsx:698-704 -> client/src/pages/content.tsx:530-539 -> server/rou |
| 63 | medium | `client/src/pages/internal/Board.tsx` | 367 | security | 1 | import at `client/src/pages/internal/Board.tsx:154-162` or link input at `client/src/pages |
| 64 | medium | `client/src/pages/geo-signals.tsx` | 426 | correctness | 1 | `ArticleSelect` at `client/src/pages/geo-signals.tsx:734-747` -> URL effect at `client/src |
| 65 | medium | `client/src/pages/internal/Dashboard.tsx` | 37 | correctness | 1 | src/routes/internal-page.tsx:21-30 -> client/src/pages/internal-page.tsx:308-311 -> client |
| 66 | medium | `client/src/pages/landing/sections/LearnResearch/AiSearchAreaChart.tsx` | 48 | responsive layout | 1 | Landing page -> LearnResearch.tsx:86 -> AiSearchAreaChart.tsx:48 -> clipped SVG. |
| 67 | medium | `client/src/pages/prompt-detail.tsx` | 344 | security | 1 | Citation response -> responseAnalyzer.ts:42-49 -> citationChecker.ts:902-904 -> geo_rankin |
| 68 | medium | `client/src/pages/settings.tsx` | 1093 | privacy | 1 | settings.tsx:891 -> userAccount.ts:267-290 -> userAccount.ts:123-131 -> export without pro |
| 69 | medium | `scripts/releaseEnvironmentPreflight.ts` | 258 | release safety | 1 | npm run db:migrate:bootstrap -> migrationRelease.ts:48-50 -> releaseEnvironmentPreflight.t |
| 70 | medium | `server/contentGenerationWorker.ts` | 81 | job reliability | 1 | content.ts:445-472 -> contentGenerationWorker.ts:85-89 -> contentGenerationWorker.ts:358-3 |
| 71 | medium | `server/data/contentRequestArticleRepository.ts` | 58 | cross-brand data integrity | 1 | articles.ts:195-231 -> contentRequestArticleRepository.ts:203-237 -> article brand move -> |
| 72 | medium | `server/lib/factAgent/v2/hybridUrlDiscovery.ts` | 170 | security | 1 | server/lib/factAgent/v2/runFullScrape.ts:220 -> server/lib/factAgent/v2/hybridUrlDiscovery |
| 73 | medium | `server/lib/factAgent/v2/sourceUserEnrich.ts` | 217 | correctness | 1 | server/routes/factSheetV2.ts:343 -> server/lib/factAgent/v2/sourceUserEnrich.ts:217 -> ser |
| 74 | medium | `server/lib/factAgent/v2/sourceStatic.ts` | 318 | correctness | 1 | server/routes/factSheetV2.ts:179-196 -> server/lib/factAgent/v2/sourceStatic.ts:318-344 -> |
| 75 | medium | `server/lib/factAgent/v2/structuredDataExtractor.ts` | 109 | correctness | 1 | server/lib/factAgent/v2/runFullScrape.ts:324 -> server/lib/factAgent/v2/sourceStatic.ts:37 |
| 76 | medium | `server/lib/promptGenerator.ts` | 364 | correctness | 1 | server/routes/prompts.ts:88 -> server/routes/prompts.ts:90 -> server/lib/promptGenerator.t |
| 77 | medium | `server/lib/runMentionScan.ts` | 16 | correctness | 1 | POST /api/brand-mentions/scans/:brandId -> server/routes/mentions.ts:408 -> server/routes/ |
| 78 | medium | `server/lib/suggestionGenerator.ts` | 211 | data loss | 1 | server/routes/prompts.ts:122-132 -> server/lib/suggestionGenerator.ts:211-225 -> server/da |
| 79 | medium | `server/lib/weeklyDigestEmitter.ts` | 64 | concurrency | 1 | two terminal weekly_catchup runs -> server/lib/workflowEngine.ts:153-175 -> server/lib/wee |
| 80 | medium | `server/lib/usageLimit.ts` | 148 | correctness | 1 | POST /api/content-jobs/:jobId/advance -> server/routes/content.ts:448-472 -> server/conten |
| 81 | medium | `server/routes/brands.ts` | 407 | security and data integrity | 1 | PUT /api/brands/:id -> server/routes/brands.ts:407-411 -> server/routes/brands.ts:437 -> s |
| 82 | medium | `server/routes/content.ts` | 603 | concurrency | 1 | authenticated POST /api/articles/:id/improve without expectedVersion -> server/routes/cont |
| 83 | medium | `server/routes/cron.ts` | 332 | concurrency and resource control | 1 | two authorized GET or POST requests -> server/routes/cron.ts:322 and 492 -> server/lib/bra |
| 84 | medium | `server/routes/factSheet.ts` | 282 | correctness | 1 | GET /api/brand-fact-sheet/runs/:runId/stream -> server/routes/factSheet.ts:282-296 or 299- |
| 85 | medium | `server/routes/enterpriseInquiry.ts` | 78 | reliability | 1 | POST /api/enterprise-inquiry -> server/routes/enterpriseInquiry.ts:78-97 -> server/emailSe |
| 86 | medium | `server/routes/factSheetV2.ts` | 678 | data integrity | 1 | POST /api/brand-fact-sheet/runs/:runId/paste -> server/routes/factSheetV2.ts:678-701 -> se |
| 87 | medium | `src/routes/_app/geo-analytics.tsx` | 4 | unspecified | 1 | Register submit, `register.tsx:89` -> success handler, `register.tsx:59` -> session write, |
| 88 | low | `tests/component/PreviewParam.test.tsx` | 7 | 1 | 2 | `client/src/pages/ai-visibility.tsx:820` -> `client/src/hooks/use-persisted-state.ts:14-16 |
| 89 | low | `src/routes/internal-page.tsx` | 21 | unspecified | 2 | `client/src/pages/ai-visibility.tsx:820` -> `client/src/hooks/use-persisted-state.ts:14-16 |
| 90 | low | `server/lib/llmConcurrency.ts` | 47 | unspecified | 1 | `client/src/pages/ai-visibility.tsx:820` -> `client/src/hooks/use-persisted-state.ts:14-16 |
| 91 | low | `client/src/pages/ai-visibility.tsx` | 820 | unspecified | 1 | `client/src/pages/ai-visibility.tsx:820` -> `client/src/hooks/use-persisted-state.ts:14-16 |
| 92 | low | `server/routes/adminScrapeInspector.ts` | 20 | unspecified | 1 | `client/src/pages/ai-visibility.tsx:820` -> `client/src/hooks/use-persisted-state.ts:14-16 |
| 93 | low | `client/src/components/dashboard-panels/useDashboardData.ts` | 407 | correctness | 1 | Leaderboard request, `useDashboardData.ts:278` -> failed data read, `useDashboardData.ts:4 |
| 94 | low | `client/src/components/geo-tools/MentionsTab.tsx` | 136 | error handling | 1 | Mentions request, `useMentions.ts:189` -> error state, `useMentions.ts:552` -> ignored des |
| 95 | low | `client/src/components/geo-tools/MentionDetailSheet.tsx` | 354 | correctness | 1 | Acknowledged sheet, `MentionDetailSheet.tsx:355` -> select New, `MentionDetailSheet.tsx:36 |
| 96 | low | `client/src/components/geo-tools/MentionCard.tsx` | 429 | correctness | 1 | Replied card, `MentionCard.tsx:430` -> action, `MentionCard.tsx:431` -> false-positive mut |
| 97 | low | `client/src/components/perception/ProbeMatrix.tsx` | 314 | security | 1 | Provider citation -> `server/citationChecker.ts:229-247` -> `server/lib/perceptionProbes.t |
| 98 | low | `client/src/pages/brand-fact-sheet.tsx` | 636 | correctness | 1 | client/src/components/fact-sheet/ManualPasteCard.tsx:41-43 -> client/src/pages/brand-fact- |
| 99 | low | `client/src/pages/brand-fact-sheet.tsx` | 621 | correctness | 1 | client/src/components/fact-sheet/ManualPasteCard.tsx:38-40 -> client/src/pages/brand-fact- |
| 100 | low | `client/src/pages/citations.tsx` | 69 | correctness | 1 | client/src/pages/citations.tsx:68-112 -> client/src/hooks/usePrompts.ts:790-797 -> client/ |
| 101 | low | `client/src/pages/content.tsx` | 798 | correctness | 1 | server/contentGenerationWorker.ts:359-390 -> server/routes/content.ts:417-428 -> client/sr |
| 102 | low | `client/src/pages/internal/Board.tsx` | 154 | correctness | 1 | JSON import at `client/src/pages/internal/Board.tsx:154-162` -> `[null]` state -> filter a |
| 103 | low | `client/src/pages/geo-signals.tsx` | 878 | correctness | 1 | article query at `client/src/pages/geo-signals.tsx:394-405` -> picker at `client/src/pages |
| 104 | low | `client/src/pages/glossary.tsx` | 40 | correctness | 1 | src/routes/glossary.tsx:11-22 -> client/src/pages/glossary.tsx:37-41 -> src/routes/_app/$. |
| 105 | low | `scripts/assertMigrationsApplied.mjs` | 29 | security | 1 | npm run db:assert-migrations -> assertMigrationsApplied.mjs:29-41 -> pg.Client with TLS di |

## Refuted

Kept so the same claim is not re-filed later.

| File | Line | Original severity | Why it does not hold |
| --- | --- | --- | --- |
| `server/lib/perceptionProbes.ts` | 341 | critical | The reset path skips cleanup. The normal path can skip cleanup after an awaited error. However, each dismissal |
| `server/auth.ts` | 231 | critical | This write access is deliberate. The allowlist, route comment, and passing tests require anonymous board write |
| `client/src/pages/geo-signals.tsx` | 1351 | critical | The dialog uses Radix `Dialog` with no `modal={false}` property. Radix defaults `modal` to true. The overlay b |
| `client/src/pages/ai-visibility.tsx` | 832 | high | The legacy key is written but no code reads it. The onboarding state comes from the user row through `/api/onb |
| `client/src/hooks/use-brand-selection.ts` | 7 | high | Logout does leave this non-prefixed key. The selected-brand hook accepts a stored ID only when it exists in th |
| `client/src/components/dashboard/Pulse.tsx` | 28 | high | The reset path skips cleanup. The normal path can skip cleanup after an awaited error. However, each dismissal |
| `server/lib/perceptionProbes.ts` | 183 | high | Logout does leave this non-prefixed key. The selected-brand hook accepts a stored ID only when it exists in th |
| `server/lib/perceptionRun.ts` | 42 | high | The legacy key is written but no code reads it. The onboarding state comes from the user row through `/api/onb |
| `client/src/components/intelligence/CompetitorsTab.tsx` | 38 | high | No caller imports or renders CompetitorsTab. Monitor loads client/src/pages/competitors.tsx instead. That live |
| `client/src/hooks/useChatbot.ts` | 91 | high | `THREADS_KEY` is the prefix of every message key. TanStack Query applies a non-exact query filter as a partial |
| `client/src/hooks/useArticleAutoSave.ts` | 28 | high | The only production caller passes onVersionBumped. A successful response updates expectedVersionRef at client/ |
| `server/citationJudge.ts` | 91 | high | The normal `runBrandPrompts` worker passes `skipJudge: true` at citationChecker.ts:679-688. It uses the merged |
| `server/lib/workflowEngine.ts` | 338 | high | Task creation and run updates are separate. However, repository callers contain no call to `startRun`. The tic |
| `server/routes/board.ts` | 137 | high | The route documents public writes as deliberate behavior. The tests require anonymous writes for every board.  |
| `server/routes/assistant.ts` | 208 | high | Every production chatbot token cap is -1. assertChatbotBudget returns before it reads token or message usage.  |
| `shared/factAgent/schema.ts` | 416 | high | The provider schema deliberately accepts per-fact `sourceExcerpt` and `sourceUrl`. It does not accept stored m |
| `tests/unit/factScrapeCacheStorage.test.ts` | 22 | medium | The legacy key is written but no code reads it. The onboarding state comes from the user row through `/api/onb |
| `src/routes/glossary.tsx` | 11 | medium | Logout does leave this non-prefixed key. The selected-brand hook accepts a stored ID only when it exists in th |
| `src/routes/privacy.tsx` | 8 | medium | The reset path skips cleanup. The normal path can skip cleanup after an awaited error. However, each dismissal |
| `vitest.config.ts` | 22 | medium | Logout does leave this non-prefixed key. The selected-brand hook accepts a stored ID only when it exists in th |
| `tests/e2e-optional/platformDetectLive.test.ts` | 33 | medium | The reset path skips cleanup. The normal path can skip cleanup after an awaited error. However, each dismissal |
| `src/routes/_app/community.tsx` | 4 | low | The legacy key is written but no code reads it. The onboarding state comes from the user row through `/api/onb |

## Unverified

291 medium and low findings were not sent to verification.
They are claims by one agent and nothing more. See REGISTER.md for the full list.
