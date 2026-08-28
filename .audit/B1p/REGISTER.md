# Consolidated findings register

Reports parsed: 37
Findings: 455
Distinct after duplicate grouping: 418
By severity: critical 10, high 135, medium 231, low 79

Nothing here is verified. Each entry is a claim by one agent.

| # | Severity | File | Line | Category | Reported by | Copies |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | critical | `server/lib/perceptionProbes.ts` | 341 | unspecified | INV05-concurrency, S16 | 2 |
| 2 | critical | `tests/component/PreviewParam.test.tsx` | 7 | 1 | INV06-test-quality, S23 | 2 |
| 3 | critical | `tests/unit/dashboardPreDataState.test.ts` | 4 | 1 | INV06-test-quality, S25 | 2 |
| 4 | critical | `server/auth.ts` | 231 | security | S01-server-core, S12 | 2 |
| 5 | critical | `server/lib/llmConcurrency.ts` | 47 | unspecified | INV05-concurrency | 1 |
| 6 | critical | `server/lib/weeklyDigestEmitter.ts` | 40 | unspecified | INV05-concurrency | 1 |
| 7 | critical | `client/src/hooks/use-auth.ts` | 27 | security | S03-client-hooks | 1 |
| 8 | critical | `client/src/pages/internal/Board.tsx` | 45 | concurrency | S08 | 1 |
| 9 | critical | `client/src/pages/internal/Board.tsx` | 34 | data persistence | S08 | 1 |
| 10 | critical | `client/src/pages/geo-signals.tsx` | 1351 | data integrity | S08 | 1 |
| 11 | high | `server/routes/mentions.ts` | 386 | unspecified | INV05-concurrency, S20 | 3 |
| 12 | high | `client/src/pages/ai-visibility.tsx` | 832 | unspecified | INV01-storage-keys, S06 | 2 |
| 13 | high | `server/lib/chatbotBudget.ts` | 35 | unspecified | INV05-concurrency, S14 | 2 |
| 14 | high | `server/lib/brandActivation.ts` | 97 | unspecified | INV05-concurrency, S14 | 2 |
| 15 | high | `server/lib/suggestionGenerator.ts` | 195 | unspecified | INV05-concurrency, S18 | 2 |
| 16 | high | `server/scheduler.ts` | 208 | security | S02-server-jobs, S21 | 2 |
| 17 | high | `server/scheduler.ts` | 39 | availability | S02-server-jobs, S21 | 2 |
| 18 | high | `client/src/hooks/useArticleAutoSave.ts` | 48 | correctness | S03-client-hooks, S05 | 2 |
| 19 | high | `client/src/hooks/useArticleAutoSave.ts` | 34 | concurrency | S03-client-hooks, S05 | 2 |
| 20 | high | `client/src/hooks/useChatbot.ts` | 66 | concurrency | S03-client-hooks | 2 |
| 21 | high | `client/src/hooks/useScrapeRunStream.ts` | 191 | availability | S03-client-hooks, S06 | 2 |
| 22 | high | `client/src/hooks/useMentions.ts` | 30 | correctness | S03-client-hooks, S05 | 2 |
| 23 | high | `client/src/pages/community-engagement.tsx` | 263 | concurrency | S07 | 2 |
| 24 | high | `client/src/pages/faq-manager.tsx` | 232 | correctness | S08 | 2 |
| 25 | high | `server/lib/factAgent/v2/factScrapeBackstop.ts` | 58 | concurrency | S15 | 2 |
| 26 | high | `server/lib/wikipediaScanner.ts` | 58 | availability | S18 | 2 |
| 27 | high | `server/routes/billing.ts` | 208 | correctness | S19 | 2 |
| 28 | high | `client/src/pages/ai-visibility.tsx` | 820 | unspecified | INV01-storage-keys | 1 |
| 29 | high | `client/src/hooks/use-brand-selection.ts` | 7 | unspecified | INV01-storage-keys | 1 |
| 30 | high | `client/src/components/dashboard/Pulse.tsx` | 28 | unspecified | INV01-storage-keys | 1 |
| 31 | high | `client/src/pages/register.tsx` | 17 | unspecified | INV01-storage-keys | 1 |
| 32 | high | `server/routes/adminScrapeInspector.ts` | 20 | unspecified | INV02-ownership | 1 |
| 33 | high | `server/routes/adminScrapeInspector.ts` | 113 | unspecified | INV02-ownership | 1 |
| 34 | high | `server/routes/adminScrapeInspector.ts` | 165 | unspecified | INV02-ownership | 1 |
| 35 | high | `server/lib/llmBudget.ts` | 45 | unspecified | INV05-concurrency | 1 |
| 36 | high | `server/lib/perceptionProbes.ts` | 183 | unspecified | INV05-concurrency | 1 |
| 37 | high | `server/lib/perceptionRun.ts` | 42 | unspecified | INV05-concurrency | 1 |
| 38 | high | `server/routes/prompts.ts` | 151 | unspecified | INV05-concurrency | 1 |
| 39 | high | `server/routes/prompts.ts` | 52 | unspecified | INV05-concurrency | 1 |
| 40 | high | `server/databaseStorage.ts` | 1927 | unspecified | INV05-concurrency | 1 |
| 41 | high | `tests/helpers/destructiveDatabaseTest.ts` | 61 | 4 | INV06-test-quality | 1 |
| 42 | high | `server/auth.ts` | 44 | correctness | S01-server-core | 1 |
| 43 | high | `server/env.ts` | 80 | configuration | S01-server-core | 1 |
| 44 | high | `client/src/components/ScanCompletionListener.tsx` | 64 | correctness | S01 | 1 |
| 45 | high | `client/src/components/articles/ViewEditDialog.tsx` | 93 | correctness | S01 | 1 |
| 46 | high | `server/scheduler.ts` | 194 | correctness | S02-server-jobs | 1 |
| 47 | high | `server/citationChecker.ts` | 322 | correctness | S02-server-jobs | 1 |
| 48 | high | `server/citationChecker.ts` | 461 | correctness | S02-server-jobs | 1 |
| 49 | high | `client/src/components/citations/PromptsTab.tsx` | 75 | correctness | S02 | 1 |
| 50 | high | `client/src/components/citations/PromptsTable.tsx` | 384 | correctness | S02 | 1 |
| 51 | high | `client/src/components/dashboard-panels/useDashboardData.ts` | 407 | correctness | S02 | 1 |
| 52 | high | `client/src/hooks/useChatbot.ts` | 279 | correctness | S03-client-hooks | 1 |
| 53 | high | `client/src/hooks/useMentions.ts` | 271 | correctness | S03-client-hooks | 1 |
| 54 | high | `client/src/components/geo-tools/MentionsFilters.tsx` | 238 | correctness | S03 | 1 |
| 55 | high | `client/src/components/geo-tools/MentionsFilters.tsx` | 161 | correctness | S03 | 1 |
| 56 | high | `client/src/components/geo-tools/MentionsTab.tsx` | 136 | error handling | S03 | 1 |
| 57 | high | `client/src/components/geo-tools/MentionDetailSheet.tsx` | 354 | correctness | S03 | 1 |
| 58 | high | `client/src/components/geo-tools/MentionCard.tsx` | 429 | correctness | S03 | 1 |
| 59 | high | `client/src/components/geo-tools/ScanStatusPanel.tsx` | 141 | correctness | S03 | 1 |
| 60 | high | `client/src/components/geo-tools/BofuContentSheet.tsx` | 142 | validation | S03 | 1 |
| 61 | high | `client/src/components/intelligence/CompetitorsTab.tsx` | 38 | error handling | S03 | 1 |
| 62 | high | `client/src/components/perception/ProbeMatrix.tsx` | 314 | security | S04 | 1 |
| 63 | high | `client/src/components/perception/ProbeMatrix.tsx` | 74 | correctness | S04 | 1 |
| 64 | high | `client/src/components/prompts/PromptsTable.tsx` | 464 | correctness | S04 | 1 |
| 65 | high | `client/src/components/ui/toaster.tsx` | 11 | correctness | S05 | 1 |
| 66 | high | `client/src/hooks/useChatbot.ts` | 42 | correctness | S05 | 1 |
| 67 | high | `client/src/hooks/useChatbot.ts` | 182 | correctness | S05 | 1 |
| 68 | high | `client/src/hooks/useChatbot.ts` | 91 | correctness | S05 | 1 |
| 69 | high | `client/src/hooks/useChatbot.ts` | 161 | concurrency | S05 | 1 |
| 70 | high | `client/src/hooks/useArticleAutoSave.ts` | 28 | correctness | S05 | 1 |
| 71 | high | `client/src/hooks/use-auth.ts` | 34 | security | S05 | 1 |
| 72 | high | `client/src/pages/brand-fact-sheet.tsx` | 636 | correctness | S06 | 1 |
| 73 | high | `client/src/pages/brand-fact-sheet.tsx` | 621 | correctness | S06 | 1 |
| 74 | high | `client/src/pages/brands.tsx` | 232 | correctness | S07 | 1 |
| 75 | high | `client/src/pages/citations.tsx` | 69 | correctness | S07 | 1 |
| 76 | high | `client/src/pages/crawler-check.tsx` | 74 | correctness | S07 | 1 |
| 77 | high | `client/src/pages/content.tsx` | 532 | correctness | S07 | 1 |
| 78 | high | `client/src/pages/content.tsx` | 798 | correctness | S07 | 1 |
| 79 | high | `client/src/pages/internal/Board.tsx` | 367 | security | S08 | 1 |
| 80 | high | `client/src/pages/internal/Board.tsx` | 154 | correctness | S08 | 1 |
| 81 | high | `client/src/pages/geo-signals.tsx` | 496 | data integrity | S08 | 1 |
| 82 | high | `client/src/pages/geo-signals.tsx` | 426 | correctness | S08 | 1 |
| 83 | high | `client/src/pages/geo-signals.tsx` | 878 | correctness | S08 | 1 |
| 84 | high | `client/src/pages/internal/Dashboard.tsx` | 37 | correctness | S08 | 1 |
| 85 | high | `client/src/pages/glossary.tsx` | 40 | correctness | S08 | 1 |
| 86 | high | `client/src/pages/landing/sections/LearnResearch/AiSearchAreaChart.tsx` | 48 | responsive layout | S09 | 1 |
| 87 | high | `client/src/pages/prompt-detail.tsx` | 344 | security | S10 | 1 |
| 88 | high | `client/src/pages/settings.tsx` | 1093 | privacy | S10 | 1 |
| 89 | high | `scripts/assertMigrationsApplied.mjs` | 29 | security | S11 | 1 |
| 90 | high | `scripts/releaseEnvironmentPreflight.ts` | 258 | release safety | S11 | 1 |
| 91 | high | `server/citationChecker.ts` | 437 | usage limit enforcement | S12 | 1 |
| 92 | high | `server/citationJudge.ts` | 91 | usage accounting | S12 | 1 |
| 93 | high | `server/citationChecker.ts` | 1252 | run status correctness | S12 | 1 |
| 94 | high | `server/citationChecker.ts` | 617 | resume correctness | S12 | 1 |
| 95 | high | `server/contentGenerationWorker.ts` | 81 | job reliability | S12 | 1 |
| 96 | high | `server/data/contentRequestArticleRepository.ts` | 58 | cross-brand data integrity | S12 | 1 |
| 97 | high | `server/databaseStorage.ts` | 3425 | correctness | S13 | 1 |
| 98 | high | `server/databaseStorage.ts` | 3885 | correctness | S13 | 1 |
| 99 | high | `server/lib/aiLogger.ts` | 29 | security | S14 | 1 |
| 100 | high | `server/lib/factAgent/v2/hybridUrlDiscovery.ts` | 170 | security | S15 | 1 |
| 101 | high | `server/lib/factAgent/v2/sourceUserEnrich.ts` | 217 | correctness | S15 | 1 |
| 102 | high | `server/lib/factAgent/v2/sourceStatic.ts` | 318 | correctness | S15 | 1 |
| 103 | high | `server/lib/factAgent/v2/runFullScrape.ts` | 356 | data loss | S15 | 1 |
| 104 | high | `server/lib/factAgent/v2/structuredDataExtractor.ts` | 109 | correctness | S15 | 1 |
| 105 | high | `server/lib/factAgent/v2/sourceStatic.ts` | 145 | availability | S15 | 1 |
| 106 | high | `server/lib/llmJobs.ts` | 308 | concurrency | S16 | 1 |
| 107 | high | `server/lib/onboardingAutopilot.ts` | 289 | concurrency | S16 | 1 |
| 108 | high | `server/lib/ssrf.ts` | 277 | security | S17 | 1 |
| 109 | high | `server/lib/promptGenerator.ts` | 364 | correctness | S17 | 1 |
| 110 | high | `server/lib/runMentionScan.ts` | 16 | correctness | S17 | 1 |
| 111 | high | `server/lib/suggestionGenerator.ts` | 211 | data loss | S18 | 1 |
| 112 | high | `server/lib/weeklyDigestEmitter.ts` | 64 | concurrency | S18 | 1 |
| 113 | high | `server/lib/workflowEngine.ts` | 338 | concurrency | S18 | 1 |
| 114 | high | `server/lib/usageLimit.ts` | 148 | correctness | S18 | 1 |
| 115 | high | `server/routes/board.ts` | 137 | security and data integrity | S19 | 1 |
| 116 | high | `server/routes/brands.ts` | 407 | security and data integrity | S19 | 1 |
| 117 | high | `server/routes/assistant.ts` | 208 | concurrency | S19 | 1 |
| 118 | high | `server/routes/content.ts` | 747 | resource control | S19 | 1 |
| 119 | high | `server/routes/content.ts` | 603 | concurrency | S19 | 1 |
| 120 | high | `server/routes/cron.ts` | 332 | concurrency and resource control | S19 | 1 |
| 121 | high | `server/routes/factSheet.ts` | 282 | correctness | S20 | 1 |
| 122 | high | `server/routes/enterpriseInquiry.ts` | 78 | reliability | S20 | 1 |
| 123 | high | `server/routes/factSheetV2.ts` | 678 | data integrity | S20 | 1 |
| 124 | high | `server/scheduler.ts` | 65 | privacy | S21 | 1 |
| 125 | high | `server/routes/prompts.ts` | 1086 | correctness | S21 | 1 |
| 126 | high | `server/routes/prompts.ts` | 170 | concurrency | S21 | 1 |
| 127 | high | `server/routes/userAccount.ts` | 86 | data handling | S21 | 1 |
| 128 | high | `server/routes/onboarding.ts` | 159 | correctness | S21 | 1 |
| 129 | high | `shared/factAgent/schema.ts` | 416 | correctness | S22 | 1 |
| 130 | high | `tests/unit/citationChecker.kickoff.test.ts` | 1 | correctness | S25 | 1 |
| 131 | medium | `server/lib/workflowEngine.ts` | 615 | unspecified | INV05-concurrency, S18 | 3 |
| 132 | medium | `client/src/pages/citations.tsx` | 356 | unspecified | INV01-storage-keys, S07 | 2 |
| 133 | medium | `client/src/pages/keyword-research.tsx` | 61 | unspecified | INV01-storage-keys, S09 | 2 |
| 134 | medium | `src/routes/internal-page.tsx` | 21 | unspecified | INV03-reachability, S22 | 2 |
| 135 | medium | `src/routes/_app/admin.scrape.tsx` | 8 | unspecified | INV03-reachability, S22 | 2 |
| 136 | medium | `server/databaseStorage.ts` | 189 | unspecified | INV05-concurrency, S13 | 2 |
| 137 | medium | `server/databaseStorage.ts` | 3916 | unspecified | INV05-concurrency, S13 | 2 |
| 138 | medium | `tests/unit/factScrapeCacheStorage.test.ts` | 22 | 3 | INV06-test-quality, S26 | 2 |
| 139 | medium | `tests/unit/v2LifecycleStorage.test.ts` | 28 | 3 | INV06-test-quality, S29 | 2 |
| 140 | medium | `client/src/lib/theme.ts` | 41 | unspecified | INV01-storage-keys | 1 |
| 141 | medium | `client/src/pages/internal-page.tsx` | 248 | unspecified | INV01-storage-keys | 1 |
| 142 | medium | `src/routes/_app/admin.scrape.$runId.tsx` | 27 | unspecified | INV03-reachability | 1 |
| 143 | medium | `src/routes/glossary.tsx` | 11 | unspecified | INV03-reachability | 1 |
| 144 | medium | `src/routes/privacy.tsx` | 8 | unspecified | INV03-reachability | 1 |
| 145 | medium | `server/databaseStorage.ts` | 1337 | unspecified | INV05-concurrency | 1 |
| 146 | medium | `vitest.config.ts` | 22 | 4 | INV06-test-quality | 1 |
| 147 | medium | `tests/e2e-optional/platformDetectLive.test.ts` | 33 | 4 | INV06-test-quality | 1 |
| 148 | medium | `server/auth.ts` | 582 | correctness | S01-server-core | 1 |
| 149 | medium | `server/routes.ts` | 362 | performance | S01-server-core | 1 |
| 150 | medium | `server/routes.ts` | 270 | correctness | S01-server-core | 1 |
| 151 | medium | `server/routes.ts` | 301 | security | S01-server-core | 1 |
| 152 | medium | `server/instrument.ts` | 7 | security | S01-server-core | 1 |
| 153 | medium | `server/app.ts` | 84 | security | S01-server-core | 1 |
| 154 | medium | `server/routes.ts` | 229 | resource abuse | S01-server-core | 1 |
| 155 | medium | `client/src/components/articles/ViewEditDialog.tsx` | 411 | correctness | S01 | 1 |
| 156 | medium | `client/src/components/articles/BufferConnectDialog.tsx` | 57 | correctness | S01 | 1 |
| 157 | medium | `client/src/components/articles/DistributeDialog.tsx` | 98 | correctness | S01 | 1 |
| 158 | medium | `client/src/components/ScanCompletionListener.tsx` | 80 | correctness | S01 | 1 |
| 159 | medium | `client/src/components/Sidebar.tsx` | 68 | accessibility | S01 | 1 |
| 160 | medium | `client/src/components/citations/HistoryTab.tsx` | 160 | correctness | S01 | 1 |
| 161 | medium | `server/citationChecker.ts` | 1117 | correctness | S02-server-jobs | 1 |
| 162 | medium | `server/scheduler.ts` | 530 | scheduling | S02-server-jobs | 1 |
| 163 | medium | `server/contentGenerationWorker.ts` | 184 | resource-lifecycle | S02-server-jobs | 1 |
| 164 | medium | `client/src/components/citations/PromptsTab.tsx` | 171 | correctness | S02 | 1 |
| 165 | medium | `client/src/components/dashboard-panels/useDashboardData.ts` | 388 | correctness | S02 | 1 |
| 166 | medium | `client/src/components/dashboard-panels/ListiclesPanel.tsx` | 89 | security | S02 | 1 |
| 167 | medium | `client/src/components/citations/PlatformResultCard.tsx` | 73 | correctness | S02 | 1 |
| 168 | medium | `client/src/components/citations/PromptDetail.tsx` | 1 | correctness | S02 | 1 |
| 169 | medium | `client/src/components/dashboard-panels/HeaderActions.tsx` | 25 | security | S02 | 1 |
| 170 | medium | `client/src/hooks/use-persisted-state.ts` | 12 | correctness | S03-client-hooks | 1 |
| 171 | medium | `client/src/hooks/useArticleAutoSave.ts` | 20 | correctness | S03-client-hooks | 1 |
| 172 | medium | `client/src/hooks/useTourState.ts` | 38 | correctness | S03-client-hooks | 1 |
| 173 | medium | `client/src/hooks/useActiveCitationRuns.ts` | 42 | resource leak | S03-client-hooks | 1 |
| 174 | medium | `client/src/components/fact-sheet/PauseToggle.tsx` | 15 | state synchronization | S03 | 1 |
| 175 | medium | `client/src/components/dashboard/Pulse.tsx` | 91 | robustness | S03 | 1 |
| 176 | medium | `client/src/components/dashboard/PlatformVisibilityBar.tsx` | 28 | data display | S03 | 1 |
| 177 | medium | `client/src/components/geo-tools/MentionsTab.tsx` | 183 | navigation | S03 | 1 |
| 178 | medium | `client/src/components/geo-tools/MentionsTab.tsx` | 291 | error handling | S03 | 1 |
| 179 | medium | `client/src/components/prompts/PromptsPageBody.tsx` | 159 | correctness | S04 | 1 |
| 180 | medium | `client/src/components/prompts/PhrasingsSection.tsx` | 113 | correctness | S04 | 1 |
| 181 | medium | `client/src/components/site-health/FindingDrawer.tsx` | 100 | correctness | S04 | 1 |
| 182 | medium | `client/src/components/site-health/FindingsTab.tsx` | 151 | correctness | S04 | 1 |
| 183 | medium | `client/src/components/intelligence/TrendsTab.tsx` | 70 | correctness | S04 | 1 |
| 184 | medium | `client/src/components/site-health/fixSnippets.tsx` | 37 | correctness | S04 | 1 |
| 185 | medium | `client/src/hooks/useMentions.ts` | 58 | correctness | S05 | 1 |
| 186 | medium | `client/src/components/ui/empty-state.tsx` | 49 | correctness | S05 | 1 |
| 187 | medium | `client/src/components/ui/toast.tsx` | 70 | accessibility | S05 | 1 |
| 188 | medium | `client/src/hooks/useScrapeRunStream.ts` | 155 | correctness | S06 | 1 |
| 189 | medium | `client/src/pages/brand-fact-sheet.tsx` | 157 | concurrency | S06 | 1 |
| 190 | medium | `client/src/pages/articles.tsx` | 164 | correctness | S06 | 1 |
| 191 | medium | `client/src/pages/articles.tsx` | 122 | correctness | S06 | 1 |
| 192 | medium | `client/src/pages/admin-scrape-inspector.tsx` | 174 | correctness | S06 | 1 |
| 193 | medium | `client/src/main.tsx` | 31 | correctness | S06 | 1 |
| 194 | medium | `client/src/pages/community-engagement.tsx` | 155 | correctness | S07 | 1 |
| 195 | medium | `client/src/pages/competitors.tsx` | 579 | correctness | S07 | 1 |
| 196 | medium | `client/src/pages/geo-tools.tsx` | 668 | correctness | S08 | 1 |
| 197 | medium | `client/src/pages/faq-manager.tsx` | 58 | correctness | S08 | 1 |
| 198 | medium | `client/src/pages/landing/sections/ClosingCta/DomainCaptureForm.tsx` | 65 | data flow | S09 | 1 |
| 199 | medium | `client/src/pages/landing/sections/HeroBento/VisibilityChartPanel.tsx` | 54 | interaction | S09 | 1 |
| 200 | medium | `client/src/pages/landing/sections/HeroBento/ActionsPanel.tsx` | 30 | interaction | S09 | 1 |
| 201 | medium | `client/src/pages/landing/sections/HeroBento/TopChrome.tsx` | 20 | interaction | S09 | 1 |
| 202 | medium | `client/src/pages/landing/sections/LearnResearch/LearnResearch.tsx` | 65 | interaction | S09 | 1 |
| 203 | medium | `client/src/pages/landing/sections/LearnResearch/data.ts` | 18 | interaction | S09 | 1 |
| 204 | medium | `client/src/pages/pricing.tsx` | 156 | correctness | S10 | 1 |
| 205 | medium | `client/src/pages/perception.tsx` | 394 | correctness | S10 | 1 |
| 206 | medium | `client/src/pages/settings.tsx` | 239 | correctness | S10 | 1 |
| 207 | medium | `client/src/pages/settings.tsx` | 453 | correctness | S10 | 1 |
| 208 | medium | `client/src/pages/register.tsx` | 30 | correctness | S10 | 1 |
| 209 | medium | `scripts/seed-stripe-products.ts` | 8 | correctness | S11 | 1 |
| 210 | medium | `scripts/setup-stripe-products.ts` | 5 | correctness | S11 | 1 |
| 211 | medium | `scripts/seed-stripe-products.ts` | 57 | operational reliability | S11 | 1 |
| 212 | medium | `client/src/tours/engine/eventBuffer.ts` | 50 | data loss | S11 | 1 |
| 213 | medium | `client/src/tours/engine/TourOrchestrator.tsx` | 110 | correctness | S11 | 1 |
| 214 | medium | `client/src/tours/engine/TourOrchestrator.tsx` | 136 | correctness | S11 | 1 |
| 215 | medium | `scripts/verify-tour-targets.ts` | 25 | verification correctness | S11 | 1 |
| 216 | medium | `client/src/pages/verify-email.tsx` | 21 | privacy and account isolation | S11 | 1 |
| 217 | medium | `client/src/pages/welcome.tsx` | 168 | user feedback | S11 | 1 |
| 218 | medium | `scripts/scrubNamedPrompts.ts` | 71 | data loss | S11 | 1 |
| 219 | medium | `scripts/run-fact-sheet-benchmark.ts` | 356 | CI reliability | S11 | 1 |
| 220 | medium | `scripts/run-fact-sheet-benchmark.ts` | 57 | CI reliability | S11 | 1 |
| 221 | medium | `scripts/hooks/guardGitWrite.mjs` | 16 | safety control | S11 | 1 |
| 222 | medium | `server/citationChecker.ts` | 535 | self-citation counting | S12 | 1 |
| 223 | medium | `server/citationChecker.ts` | 555 | brand matching correctness | S12 | 1 |
| 224 | medium | `server/databaseStorage.ts` | 3955 | pagination | S13 | 1 |
| 225 | medium | `server/databaseStorage.ts` | 4998 | pagination | S13 | 1 |
| 226 | medium | `server/databaseStorage.ts` | 2913 | concurrency | S13 | 1 |
| 227 | medium | `server/databaseStorage.ts` | 1187 | concurrency | S13 | 1 |
| 228 | medium | `server/lib/factAgent/persistFacts.ts` | 181 | concurrency | S14 | 1 |
| 229 | medium | `server/lib/circuitBreaker.ts` | 88 | concurrency | S14 | 1 |
| 230 | medium | `server/lib/crawlerAccess.ts` | 231 | correctness | S14 | 1 |
| 231 | medium | `server/lib/factAgent/robotsCache.ts` | 7 | correctness | S14 | 1 |
| 232 | medium | `server/lib/factAgent/v2/aggregate.ts` | 35 | correctness | S14 | 1 |
| 233 | medium | `server/lib/brandNameFilter.ts` | 35 | correctness | S14 | 1 |
| 234 | medium | `server/lib/brandPresenceGate.ts` | 25 | correctness | S14 | 1 |
| 235 | medium | `server/lib/audienceGenerator.ts` | 134 | correctness | S14 | 1 |
| 236 | medium | `server/lib/factAgent/v2/domainAllowlist.ts` | 33 | security | S14 | 1 |
| 237 | medium | `server/lib/advisoryLock.ts` | 126 | concurrency | S14 | 1 |
| 238 | medium | `server/lib/factAgent/validators.ts` | 18 | correctness | S15 | 1 |
| 239 | medium | `server/lib/factAgent/v2/persistPasteFacts.ts` | 25 | concurrency | S15 | 1 |
| 240 | medium | `server/lib/factAgent/v2/runFullScrape.ts` | 324 | correctness | S15 | 1 |
| 241 | medium | `server/lib/factAgent/v2/sitemapDiscovery.ts` | 220 | correctness | S15 | 1 |
| 242 | medium | `server/lib/factAgent/v2/hybridUrlDiscovery.ts` | 81 | correctness | S15 | 1 |
| 243 | medium | `server/lib/factAgent/v2/urlTierScoring.ts` | 42 | correctness | S15 | 1 |
| 244 | medium | `server/lib/factAgent/v2/homepageNavExtractor.ts` | 10 | correctness | S15 | 1 |
| 245 | medium | `server/lib/factAgent/v2/hydrationSanitizer.ts` | 32 | security | S15 | 1 |
| 246 | medium | `server/lib/factAgent/v2/jinaFallback.ts` | 64 | availability | S15 | 1 |
| 247 | medium | `server/lib/factAgent/v2/rscExtractor.ts` | 94 | correctness | S15 | 1 |
| 248 | medium | `server/lib/llmConcurrency.ts` | 55 | concurrency | S16 | 1 |
| 249 | medium | `server/lib/metricsSnapshot.ts` | 32 | correctness | S16 | 1 |
| 250 | medium | `server/lib/notificationPrefs.ts` | 36 | correctness | S16 | 1 |
| 251 | medium | `server/lib/ownership.ts` | 37 | correctness | S16 | 1 |
| 252 | medium | `server/lib/pageContentAnalysis.ts` | 118 | correctness | S16 | 1 |
| 253 | medium | `server/lib/perceptionRun.ts` | 57 | correctness | S16 | 1 |
| 254 | medium | `server/lib/listicleScanner.ts` | 90 | correctness | S16 | 1 |
| 255 | medium | `server/lib/hallucinationDetector.ts` | 12 | reliability | S16 | 1 |
| 256 | medium | `server/lib/perceptionProbes.ts` | 191 | consistency | S16 | 1 |
| 257 | medium | `server/lib/runMentionScan.ts` | 24 | concurrency | S17 | 1 |
| 258 | medium | `server/lib/sourceHealth.ts` | 68 | concurrency | S17 | 1 |
| 259 | medium | `server/lib/runChangeAlerts.ts` | 105 | correctness | S17 | 1 |
| 260 | medium | `server/lib/promptScoreHistory.ts` | 140 | correctness | S17 | 1 |
| 261 | medium | `server/lib/safeParseJson.ts` | 9 | correctness | S17 | 1 |
| 262 | medium | `server/lib/siteHealthHistory.ts` | 33 | correctness | S17 | 1 |
| 263 | medium | `server/lib/promptDiagnose.ts` | 349 | correctness | S17 | 1 |
| 264 | medium | `server/lib/suggestionGenerator.ts` | 182 | correctness | S18 | 1 |
| 265 | medium | `server/routes.ts` | 283 | correctness | S18 | 1 |
| 266 | medium | `server/routes/analytics.ts` | 231 | correctness | S18 | 1 |
| 267 | medium | `server/routes/analytics.ts` | 815 | data integrity | S18 | 1 |
| 268 | medium | `server/routes/analytics.ts` | 558 | data integrity | S18 | 1 |
| 269 | medium | `server/routes/analytics.ts` | 603 | availability | S18 | 1 |
| 270 | medium | `server/routes.ts` | 371 | performance | S18 | 1 |
| 271 | medium | `server/routes/analytics.ts` | 237 | performance | S18 | 1 |
| 272 | medium | `server/routes/analytics.ts` | 252 | data integrity | S18 | 1 |
| 273 | medium | `server/lib/trackedContentMatcher.ts` | 53 | correctness | S18 | 1 |
| 274 | medium | `server/lib/trackedContentMatcher.ts` | 33 | correctness | S18 | 1 |
| 275 | medium | `server/lib/workflowEngine.ts` | 88 | concurrency | S18 | 1 |
| 276 | medium | `server/lib/workflowEngine.ts` | 670 | memory | S18 | 1 |
| 277 | medium | `server/routes/board.ts` | 104 | concurrency | S19 | 1 |
| 278 | medium | `server/routes/articles.ts` | 653 | correctness and validation | S19 | 1 |
| 279 | medium | `server/routes/articles.ts` | 45 | correctness | S19 | 1 |
| 280 | medium | `server/routes/brands.ts` | 319 | concurrency | S19 | 1 |
| 281 | medium | `server/routes/buffer.ts` | 202 | validation | S19 | 1 |
| 282 | medium | `server/routes/buffer.ts` | 32 | availability | S19 | 1 |
| 283 | medium | `server/routes/community.ts` | 153 | validation | S19 | 1 |
| 284 | medium | `server/routes/content.ts` | 650 | correctness and consistency | S19 | 1 |
| 285 | medium | `server/routes/content.ts` | 724 | security | S19 | 1 |
| 286 | medium | `server/routes/contentTypes.ts` | 837 | correctness and data integrity | S19 | 1 |
| 287 | medium | `server/routes/contentTypes.ts` | 605 | correctness and consistency | S19 | 1 |
| 288 | medium | `server/routes/dashboard.ts` | 1747 | security and cost | S20 | 1 |
| 289 | medium | `server/routes/dashboard.ts` | 1653 | concurrency | S20 | 1 |
| 290 | medium | `server/routes/dashboard.ts` | 1754 | concurrency | S20 | 1 |
| 291 | medium | `server/routes/dashboard.ts` | 1781 | concurrency and cost | S20 | 1 |
| 292 | medium | `server/routes/dashboard.ts` | 196 | correctness and cache invalidation | S20 | 1 |
| 293 | medium | `server/routes/dashboard.ts` | 1465 | correctness and cache invalidation | S20 | 1 |
| 294 | medium | `server/routes/dashboard.ts` | 864 | correctness | S20 | 1 |
| 295 | medium | `server/routes/logoProxy.ts` | 62 | reliability | S20 | 1 |
| 296 | medium | `server/routes/logoProxy.ts` | 87 | security | S20 | 1 |
| 297 | medium | `server/routes/factSheet.ts` | 524 | data integrity | S20 | 1 |
| 298 | medium | `server/routes/intelligence.ts` | 88 | API validation | S20 | 1 |
| 299 | medium | `server/routes/prompts.ts` | 1093 | correctness | S21 | 1 |
| 300 | medium | `server/routes/prompts.ts` | 329 | correctness | S21 | 1 |
| 301 | medium | `server/routes/prompts.ts` | 1478 | correctness | S21 | 1 |
| 302 | medium | `server/setupProducts.ts` | 94 | concurrency | S21 | 1 |
| 303 | medium | `server/routes/prompts.ts` | 490 | correctness | S21 | 1 |
| 304 | medium | `server/routes/prompts.ts` | 88 | correctness | S21 | 1 |
| 305 | medium | `shared/schema.ts` | 198 | correctness | S22 | 1 |
| 306 | medium | `server/webhookHandlers.ts` | 317 | correctness | S22 | 1 |
| 307 | medium | `src/routes/-shared/routeGates.tsx` | 154 | navigation | S22 | 1 |
| 308 | medium | `src/routes/_app/geo-tools.tsx` | 5 | correctness | S22 | 1 |
| 309 | medium | `tests/component/TourOrchestrator.test.tsx` | 51 | false-positive test | S23 | 1 |
| 310 | medium | `tests/e2e/spine-navigation.spec.ts` | 37 | false-positive test | S23 | 1 |
| 311 | medium | `tests/e2e/tours.spec.ts` | 52 | disabled test | S23 | 1 |
| 312 | medium | `tests/e2e/tours.spec.ts` | 153 | disabled test | S23 | 1 |
| 313 | medium | `tests/e2e/support/global-teardown.ts` | 3 | test cleanup | S23 | 1 |
| 314 | medium | `tests/integration/competitorGeoRankingUpsert.test.ts` | 40 | concurrency | S23 | 1 |
| 315 | medium | `tests/integration/llmConcurrency.test.ts` | 33 | concurrency | S23 | 1 |
| 316 | medium | `tests/integration/contentRequestRls.test.ts` | 821 | test isolation | S23 | 1 |
| 317 | medium | `tests/e2e/url-state.spec.ts` | 236 | test cleanup | S23 | 1 |
| 318 | medium | `tests/e2e/auth-login.spec.ts` | 94 | false-positive test | S23 | 1 |
| 319 | medium | `tests/integration/localOutboxMigration.test.ts` | 1 | correctness | S24 | 1 |
| 320 | medium | `tests/unit/MentionsTab.test.tsx` | 427 | test coverage | S24 | 1 |
| 321 | medium | `tests/unit/brandFactScrapeRunsStorage.test.ts` | 73 | test coverage | S24 | 1 |
| 322 | medium | `tests/unit/checkoutCatalogGate.test.ts` | 27 | correctness | S25 | 1 |
| 323 | medium | `tests/unit/contentCostOutboxAdapter.test.ts` | 41 | correctness | S25 | 1 |
| 324 | medium | `tests/unit/brandFactSheetConflictsQuery.test.ts` | 36 | security testing | S25 | 1 |
| 325 | medium | `tests/unit/brandFactSheetConflictsQuery.test.ts` | 83 | correctness testing | S25 | 1 |
| 326 | medium | `tests/unit/brandMonthlyCostCapsStorage.test.ts` | 36 | correctness testing | S25 | 1 |
| 327 | medium | `tests/unit/contentRequestData.test.ts` | 44 | security testing | S25 | 1 |
| 328 | medium | `tests/unit/factSheetPersist.test.ts` | 45 | correctness testing | S26 | 1 |
| 329 | medium | `tests/unit/geoSignalRuns.test.ts` | 44 | security testing | S26 | 1 |
| 330 | medium | `tests/unit/detectFactScrapeFailureRate.test.ts` | 42 | correctness testing | S26 | 1 |
| 331 | medium | `tests/unit/emailVerification.test.ts` | 58 | concurrency testing | S26 | 1 |
| 332 | medium | `tests/unit/jobDebounce.test.ts` | 85 | concurrency testing | S26 | 1 |
| 333 | medium | `tests/unit/factSheetRunsCancel.test.ts` | 67 | correctness testing | S26 | 1 |
| 334 | medium | `tests/unit/factSheetSseStream.test.ts` | 338 | correctness testing | S26 | 1 |
| 335 | medium | `tests/unit/mentionsRoutes.test.ts` | 85 | security | S27 | 1 |
| 336 | medium | `tests/unit/mentionsStorage.test.ts` | 55 | security | S27 | 1 |
| 337 | medium | `tests/unit/mentionsStorage.test.ts` | 482 | correctness | S27 | 1 |
| 338 | medium | `tests/unit/outboxWorker.test.ts` | 98 | correctness | S27 | 1 |
| 339 | medium | `tests/unit/persistFactsMerge.test.ts` | 35 | correctness | S27 | 1 |
| 340 | medium | `tests/unit/pricingCurrentPlan.test.ts` | 20 | correctness | S27 | 1 |
| 341 | medium | `tests/unit/promptGeneratorCap.test.ts` | 20 | test coverage | S28 | 1 |
| 342 | medium | `tests/unit/requestRepositories.test.ts` | 160 | security test coverage | S28 | 1 |
| 343 | medium | `tests/unit/siteHealth.test.ts` | 84 | test correctness | S28 | 1 |
| 344 | medium | `tests/unit/promptScoreHistory.test.ts` | 83 | test coverage | S28 | 1 |
| 345 | medium | `tests/unit/rateLimitBuckets.test.ts` | 3 | concurrency test coverage | S28 | 1 |
| 346 | medium | `tests/unit/resendWebhook.test.ts` | 7 | protocol test coverage | S28 | 1 |
| 347 | medium | `tests/unit/welcomeTourNotOnWelcomePage.test.ts` | 17 | test quality | S29 | 1 |
| 348 | medium | `tests/unit/useBrandActivation.test.tsx` | 46 | test quality | S29 | 1 |
| 349 | low | `src/routes/_app/home2.tsx` | 15 | unspecified | INV03-reachability, S22 | 2 |
| 350 | low | `tests/unit/citationCronUnconditional.test.ts` | 28 | 5 | INV06-test-quality, S25 | 2 |
| 351 | low | `tests/unit/planBeforeBrandGate.test.ts` | 18 | 5 | INV06-test-quality, S27 | 2 |
| 352 | low | `server/log.ts` | 1 | maintainability | S01-server-core, S18 | 2 |
| 353 | low | `server/citationJudge.ts` | 102 | correctness | S02-server-jobs, S12 | 2 |
| 354 | low | `src/routes/_app/community.tsx` | 4 | unspecified | INV03-reachability | 1 |
| 355 | low | `src/routes/_app/competitors.tsx` | 4 | unspecified | INV03-reachability | 1 |
| 356 | low | `src/routes/_app/ai-intelligence.tsx` | 12 | unspecified | INV03-reachability | 1 |
| 357 | low | `src/routes/_app/geo-analytics.tsx` | 4 | unspecified | INV03-reachability | 1 |
| 358 | low | `src/routes/_app/opportunities.tsx` | 4 | unspecified | INV03-reachability | 1 |
| 359 | low | `tests/unit/billingSubscriptionGuards.test.ts` | 20 | 5 | INV06-test-quality | 1 |
| 360 | low | `tests/unit/requestRlsMigrationShape.test.ts` | 8 | 5 | INV06-test-quality | 1 |
| 361 | low | `tests/unit/rlsInitplanMigrationShape.test.ts` | 14 | 5 | INV06-test-quality | 1 |
| 362 | low | `tests/unit/schedulerOrchestratorParity.test.ts` | 26 | 5 | INV06-test-quality | 1 |
| 363 | low | `tests/unit/schedulerMode.test.ts` | 81 | 5 | INV06-test-quality | 1 |
| 364 | low | `tests/unit/settingsPlanSwitch.test.ts` | 12 | 5 | INV06-test-quality | 1 |
| 365 | low | `tests/unit/stripeTestModeBanner.test.ts` | 14 | 5 | INV06-test-quality | 1 |
| 366 | low | `tests/unit/stripeWebhookCoverage.test.ts` | 17 | 5 | INV06-test-quality | 1 |
| 367 | low | `server/app.ts` | 335 | correctness | S01-server-core | 1 |
| 368 | low | `server/app.ts` | 329 | reliability | S01-server-core | 1 |
| 369 | low | `client/src/components/chatbot/MessageBubble.tsx` | 21 | correctness | S01 | 1 |
| 370 | low | `client/src/components/CommandPalette.tsx` | 256 | correctness | S01 | 1 |
| 371 | low | `client/src/components/SidebarOnboarding.tsx` | 75 | dead code | S01 | 1 |
| 372 | low | `server/contentGenerationWorker.ts` | 438 | dead code | S02-server-jobs | 1 |
| 373 | low | `client/src/components/dashboard-panels/Panel.tsx` | 113 | dead code | S02 | 1 |
| 374 | low | `client/src/components/dashboard-panels/useDashboardData.ts` | 8 | wrong comments | S02 | 1 |
| 375 | low | `client/src/components/citations/PlatformResultCard.tsx` | 29 | wrong comments | S02 | 1 |
| 376 | low | `client/src/components/dashboard-panels/PromptsRow.tsx` | 394 | wrong comments | S02 | 1 |
| 377 | low | `client/src/hooks/usePrompts.ts` | 305 | dead code | S03-client-hooks | 1 |
| 378 | low | `client/src/components/fact-sheet/ScrapeFailureState.tsx` | 1 | documentation | S03 | 1 |
| 379 | low | `client/src/components/prompts/PromptsTable.tsx` | 296 | correctness | S04 | 1 |
| 380 | low | `client/src/components/intelligence/HallucinationsTab.tsx` | 140 | correctness | S04 | 1 |
| 381 | low | `client/src/components/ui/form.tsx` | 27 | correctness | S05 | 1 |
| 382 | low | `client/src/hooks/useActiveCitationRuns.ts` | 13 | correctness | S05 | 1 |
| 383 | low | `client/src/components/ui/context-menu.tsx` | 175 | dead-code | S05 | 1 |
| 384 | low | `client/src/lib/formatRelativeTime.ts` | 4 | correctness | S06 | 1 |
| 385 | low | `client/src/lib/stripTrackingParams.ts` | 32 | correctness | S06 | 1 |
| 386 | low | `client/src/lib/pageExplainers.ts` | 3 | wrong comment/docs | S06 | 1 |
| 387 | low | `client/src/lib/chartTheme.ts` | 43 | dead code | S06 | 1 |
| 388 | low | `client/src/lib/onboardingSteps.ts` | 87 | dead code | S06 | 1 |
| 389 | low | `client/src/pages/geo-signals.tsx` | 543 | dead code | S08 | 1 |
| 390 | low | `client/src/pages/landing/hooks/useCountUp.ts` | 8 | dead code | S09 | 1 |
| 391 | low | `client/src/pages/landing/sections/Footer/icons.tsx` | 21 | dead code | S09 | 1 |
| 392 | low | `client/src/pages/landing/sections/Nav/icons.tsx` | 36 | dead code | S09 | 1 |
| 393 | low | `client/src/pages/internal/types.ts` | 87 | concurrency | S09 | 1 |
| 394 | low | `client/src/pages/pricing.tsx` | 23 | dead-code | S10 | 1 |
| 395 | low | `client/src/pages/prompt-diagnose.tsx` | 3 | dead-code | S10 | 1 |
| 396 | low | `client/src/pages/landing/ui/Popover.tsx` | 25 | dead-code | S10 | 1 |
| 397 | low | `scripts/syncSupabaseMigrations.mjs` | 135 | verification correctness | S11 | 1 |
| 398 | low | `scripts/setupProjectSkills.mjs` | 40 | verification correctness | S11 | 1 |
| 399 | low | `scripts/audit-fact-sheet.ts` | 230 | reporting correctness | S11 | 1 |
| 400 | low | `client/src/pages/welcome.tsx` | 683 | accessibility | S11 | 1 |
| 401 | low | `server/lib/factAgent/v2/sourceStatic.ts` | 266 | observability | S15 | 1 |
| 402 | low | `server/lib/factAgent/v2/jinaFallback.ts` | 165 | dead-code | S15 | 1 |
| 403 | low | `server/lib/sources/hackerNewsSource.ts` | 203 | correctness | S17 | 1 |
| 404 | low | `server/lib/recommendationsEngine.ts` | 213 | correctness | S17 | 1 |
| 405 | low | `server/routes/cron.ts` | 612 | API contract | S19 | 1 |
| 406 | low | `src/routes/__root__.tsx` | 74 | seo | S22 | 1 |
| 407 | low | `shared/factCategories.ts` | 9 | maintainability | S22 | 1 |
| 408 | low | `tests/fixtures/tourState.ts` | 6 | dead code | S23 | 1 |
| 409 | low | `tests/e2e/support/local-fixtures.ts` | 290 | dead code | S23 | 1 |
| 410 | low | `tests/helpers/supabaseMirror.ts` | 47 | dead code | S23 | 1 |
| 411 | low | `tests/e2e/url-state.spec.ts` | 186 | duplicated logic | S23 | 1 |
| 412 | low | `tests/component/PageHeaderHelp.test.tsx` | 6 | incomplete component test | S23 | 1 |
| 413 | low | `tests/unit/probeMatrix.test.tsx` | 53 | correctness | S27 | 1 |
| 414 | low | `tests/unit/visibilityMetrics.test.ts` | 87 | test quality | S29 | 1 |
| 415 | low | `tests/unit/unsubscribeToken.test.ts` | 52 | test quality | S29 | 1 |
| 416 | low | `tests/unit/v2ExtractionPrompt.test.ts` | 87 | test quality | S29 | 1 |
| 417 | low | `tests/unit/v2FactScrapeBackstop.test.ts` | 63 | test quality | S29 | 1 |
| 418 | low | `tests/unit/v2WeeklySummary.test.ts` | 12 | test quality | S29 | 1 |
