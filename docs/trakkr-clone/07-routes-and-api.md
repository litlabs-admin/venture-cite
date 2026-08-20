# Trakkr replication spec - part 07: routes, redirects, API surface, docs tree

Source of record: the live application at `https://trakkr.ai`, observed 2026-08-07.

Method:
- The application is a Vite single-page application. The entry bundle is `/assets/index-DaRqwO8U.js` (1,486,157 bytes). This name is verified, not assumed.
- The router is React Router v6 with a nested route-object array. Routes were extracted from the entry bundle with several regular expressions (`path:"..."`, redirect elements, and balanced-bracket parsing of `children:[...]` arrays and of the named child arrays `zD`, `Rpe`, `Ipe`, `Ppe`).
- 158 additional lazy chunks exist under `/assets/`. All of them were fetched and scanned for API path literals.
- Live API calls were captured with a `PerformanceObserver` on `resource` entries, filtered to the host `api.trakkr.ai`.
- The signed-in account tracks one brand. Its brand id is templated as `{brandId}` below. User ids are templated as `{id}`.

---

## 1. Complete route table

### 1.1 Notation

| Symbol | Meaning |
|---|---|
| `:name` | Dynamic route parameter |
| `*` | Splat / catch-all segment |
| `{}` | Not applicable |

Auth classes used in the tables:

| Class | Meaning |
|---|---|
| app | Requires a signed-in Trakkr user. Route is wrapped in the protected app shell. |
| app-admin | Requires a signed-in user with admin access. Wrapped in a separate admin guard. |
| app-paid | Requires a signed-in user and a paid feature gate (`access:"paid"` or a named feature). |
| client | Requires a signed-in client-portal user. Separate guard and separate layout. |
| marketing | Public. No credentials. Marketing or programmatic SEO page. |
| public-share | Public. Reached by token or slug. No account needed. |
| auth-callback | Public. Handles an OAuth or magic-link return. |
| internal | Present in the bundle. Not part of the product. See section 1.11. |

---

### 1.2 Cluster: app (signed-in product)

All routes below are children of the protected app layout. Auth class is `app` unless stated.

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/dashboard` | {} | app | Main brand dashboard. Visibility, mentions, rank, citations, AI traffic. |
| `/dashboard/double` | {} | app | Second dashboard variant ("double") for the same brand. |
| `/actions` | {} | app-paid (`actions`) | Unified recommendation and work queue. |
| `/research` | {} | app | Prompt research runs and topic snapshots. |
| `/results/quarter` | {} | app | Quarterly results view of shipped work. |
| `/pages` | {} | app | Page registry. One row per URL. |
| `/pages/:slug` | `slug` | app | Single page record. |
| `/citations` | {} | app | Citation landscape. Supports `?view=outreach`. |
| `/locations` | {} | app | Market and location configuration. |
| `/reports` | {} | app | Generated report list. |
| `/reports/:id` | `id` | app | One generated report. |
| `/share` | {} | app | Share composer for dashboards and cards. |
| `/business-case` | {} | app | Business-case builder. |
| `/explore` | {} | app | Exploration view over the brand series. |
| `/prompts` | {} | app | Tracked prompts. Supports `?tab=personas`. |
| `/prompts/:category` | `category` | app | Prompts filtered by category. |
| `/prompts/p/:promptId` | `promptId` | app | Single prompt detail. |
| `/competitors` | {} | app | Competitor set and comparison. |
| `/competitors/:name` | `name` | app | One competitor. |
| `/perception` | {} | app | Brand perception. Supports `?tab=narratives`. |
| `/audiences/:audienceId` | `audienceId` | app | One audience / persona. |
| `/narratives/:id` | `id` | app | One narrative. |
| `/activity` | {} | app | Activity and notification feed. |
| `/accuracy` | {} | app | Fact-accuracy view. Redirects for this account - see section 2. |
| `/accuracy/print` | {} | app | Print layout of the accuracy view. |
| `/client/accuracy/print` | {} | client | Print layout of the accuracy view inside the client portal. |
| `/traffic/analytics` | {} | app | AI referral traffic from connected analytics. |
| `/traffic/crawler` | {} | app | AI crawler dashboard. |
| `/traffic/crawler/sources` | {} | app | Crawler source breakdown. |
| `/traffic/search-console` | {} | app | Google Search Console view. |
| `/reddit` | {} | app | Reddit monitoring. |
| `/content` | {} | app | Content surface. Redirects - see section 2. |
| `/content/*` | splat | app | Content sub-paths. |
| `/create` | {} | app | Content creation workspace (layout route). |
| `/create` (index) | {} | app | Create home. |
| `/create/articles/:id` | `id` | app | Article view. |
| `/create/articles/:id/edit` | `id` | app | Article editor. |
| `/create/campaigns/:id` | `id` | app | Campaign detail. |
| `/create/templates` | {} | app | Article template list. |
| `/create/templates/new` | {} | app | New template. |
| `/create/templates/:id` | `id` | app | One template. |
| `/optimize` | {} | app-paid (`optimize`) | Site optimisation audit. |
| `/optimize/audits/:auditId/pages/:pageId` | `auditId`, `pageId` | app-paid (`optimize`) | One audited page. |
| `/ai-pages` | {} | app-paid (`prism`) | AI Pages (formerly Prism). |
| `/workflows` | {} | app-paid (`workflows`) | Legacy automations surface. Redirects - see section 2. |
| `/workflows/:id` | `id` | app-paid (`workflows`) | Legacy single workflow. |
| `/automations` | {} | app | Automations home. |
| `/automations/new` | {} | app | New automation. |
| `/automations/agent/:id` | `id` | app | One agent automation. |
| `/automations/rules/:id` | `id` | app | One exact rule. |
| `/automations/rules/:id/legacy` | `id` | app | Legacy editor for one rule. |
| `/settings` | {} | app | Settings. Supports `?tab=brands`. |
| `/integrate` | {} | app | Integration hub. |
| `/integrate/work-items` | {} | app | Work-item integrations (issue trackers). |
| `/sites` | {} | app | Connected sites (writable layer). |
| `/exports/csv` | {} | app | CSV export. |
| `/exports/sheets` | {} | app | Google Sheets export. |
| `/exports/looker-studio` | {} | app | Looker Studio connector. |
| `/exports/api-keys` | {} | app | API key management. |
| `/roadmap` | {} | app | Product roadmap. |
| `/agent` | {} | app | AI agent workspace. |
| `/agent/drafts` | {} | app | Agent drafts. |
| `/diagnose` | {} | app | Query diagnosis. |
| `/diagnose/:id` | `id` | app | One diagnosis run. |
| `/playbook` | {} | app | Playbook. Redirects for this account - see section 2. |
| `/playbook/:lessonKey` | `lessonKey` | app | One playbook lesson. |
| `/double` | {} | app | Case-study surface ("double"). |
| `/upgrade` | {} | app | Plan upgrade. |
| `/upgrade/success` | {} | app | Upgrade confirmation. |
| `/onboarding` | {} | app | New-user onboarding journey. |
| `/onboarding/complete` | {} | app | Onboarding completion. |
| `/setup` | {} | app | Brand setup wizard. |
| `/add-brand` | {} | app | Add a brand (same component as `/setup`). |
| `/inbox` | {} | app-admin | Inbox. |
| `/admin` | {} | app-admin | Admin console. |
| `/admin/answers` | {} | app-admin | Admin answers management. |
| `/admin/copilot` | {} | app-admin | Admin copilot. |
| `/workflow-tests` | {} | app-admin | Workflow test harness. |
| `/qa` | {} | app | QA surface. NOT OBSERVED in the navigation. |
| `/data/card` | {} | marketing | Data story card renderer. |
| `/data/card/:storyId` | `storyId` | marketing | One data story card. |

Fact-accuracy print aliases: `/fact-accuracy` and `/fact-accuracy/print` exist and redirect. See section 2.

---

### 1.3 Cluster: agency

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/agency` | {} | app | Agency portfolio home. Supports `?view=compare`. |
| `/agency/:slug` | `slug` | app | Agency workspace by slug. |
| `/agency/pitches` | {} | app (pitch manager) | Prospect pitch list. |
| `/agency/pitches/:id` | `id` | app (pitch manager) | One pitch. |
| `/agency/demos` | {} | app (pitch manager) | Demo list (same component as pitches). |
| `/agency/demos/:id` | `id` | app (pitch manager) | One demo. |
| `/agency/actions` | {} | app | Portfolio-wide actions. |
| `/agency/reports` | {} | app | Agency report scheduling and history. |
| `/agency/slides` | {} | app | Slide export. |
| `/agency/compare` | {} | app | Alias. Redirects - see section 2. |
| `/agency/reporting` | {} | app | Alias. Redirects - see section 2. |
| `/agency/pdf-export` | {} | app | Alias. Redirects - see section 2. |

---

### 1.4 Cluster: client portal

Parent route `/client` carries its own layout and its own error element. All children are relative.

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/client` (index) | {} | client | Portal index. |
| `/client/dashboard` | {} | client | Client dashboard. |
| `/client/prompts` | {} | client | Client prompts. Supports `?tab=personas`. |
| `/client/prompts/p/:promptId` | `promptId` | client | One prompt. |
| `/client/reports` | {} | client | Client report list. |
| `/client/reports/:id` | `id` | client | One client report. |
| `/client/competitors` | {} | client | Client competitors. |
| `/client/citations` | {} | client | Client citations. |
| `/client/perception` | {} | client | Client perception. |
| `/client/pages` | {} | client | Client page registry. |
| `/client/pages/:slug` | `slug` | client | One page. |
| `/client/actions` | {} | client | Client action list. |
| `/client/audiences` | {} | client | Alias. Redirects to `/client/prompts?tab=personas`. |
| `/client/audiences/:audienceId` | `audienceId` | client | One audience. |
| `/client/about` | {} | client | Portal about page. |
| `/client/profile` | {} | client | Client user profile. |
| `/client/*` | splat | client | Portal catch-all. |
| `/client/login` | {} | public | Client portal sign-in. |
| `/client/forgot-password` | {} | public | Client portal password reset request. |
| `/client/reset-password` | {} | public | Client portal password reset. |
| `/client/accuracy/print` | {} | client | Print accuracy view. |

---

### 1.5 Cluster: marketing

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/` | {} | marketing | Home. |
| `/about` | {} | marketing | About. |
| `/pricing` | {} | marketing | Pricing. |
| `/features` | {} | marketing | Feature index. |
| `/features/ai-citation-tracking` | {} | marketing | Alias. Redirects. |
| `/platforms` | {} | marketing | Platform index. |
| `/platforms/:slug` | `slug` | marketing | One platform. |
| `/integrations` | {} | marketing | Integration index. |
| `/integrations/:slug` | `slug` | marketing | One integration. |
| `/partners` | {} | marketing | Partners. |
| `/enterprise` | {} | marketing | Alias. Redirects. |
| `/trakkr-for/agencies` | {} | marketing | Agency segment page. |
| `/trakkr-for/enterprise` | {} | marketing | Enterprise segment page. |
| `/trakkr-for/startups` | {} | marketing | Startup segment page. |
| `/blog` | {} | marketing | Blog index. |
| `/blog/:slug` | `slug` | marketing | Blog post. |
| `/changelog` | {} | marketing | Changelog. |
| `/roadmap` | {} | app | Roadmap (inside the app shell). |
| `/status` | {} | marketing | Public status page. |
| `/security` | {} | marketing | Security. |
| `/privacy` | {} | marketing | Privacy policy. |
| `/terms` | {} | marketing | Terms. |
| `/support` | {} | marketing | Support. |
| `/login` | {} | public | Sign in. |
| `/logout` | {} | public | Sign out. |
| `/start` | {} | public | Signup / first-run entry. |
| `/reset-password` | {} | public | Password reset. |
| `/case-study` | {} | marketing | Alias. Redirects to `/double`. |
| `/marketing` | {} | marketing | Marketing index. NOT OBSERVED in navigation. |
| `/components` | {} | internal | Component gallery. |
| `/design` | {} | internal | Design surface. |
| `/design/unity` | {} | internal | Unity design surface. |
| `/unity` | {} | internal | Unity surface. |
| `/jackie` | {} | marketing | Named landing page. |
| `/mack-grenfell` | {} | marketing | Author page. |
| `/open-source` | {} | marketing | Open-source layout parent. |
| `/open-source` (index) | {} | marketing | Open-source home. |
| `/open-source/performance` | {} | marketing | Performance data. |
| `/open-source/pages` | {} | marketing | Pages data. |
| `/open-source/page/*` | splat | marketing | One page record. |
| `/open-source/platforms` | {} | marketing | Platform data. |
| `/open-source/health` | {} | marketing | Health data. |
| `/open-source/wire` | {} | marketing | Live wire feed. |

---

### 1.6 Cluster: programmatic SEO

#### 1.6.1 Comparison, alternative, and review families

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/compare` | {} | marketing | Comparison index. |
| `/compare/:slug` | `slug` | marketing | Generic comparison page. |
| `/compare/aeo-tools-2026` | {} | marketing | AEO tool comparison. |
| `/compare/aiclicks-vs-trakkr` | {} | marketing | Named comparison. |
| `/compare/athenahq-vs-trakkr` | {} | marketing | Named comparison. |
| `/compare/conductor-vs-trakkr` | {} | marketing | Named comparison. |
| `/compare/mentions-so-vs-trakkr` | {} | marketing | Named comparison. |
| `/compare/otterly-vs-trakkr` | {} | marketing | Named comparison. |
| `/compare/profound-vs-trakkr` | {} | marketing | Named comparison. |
| `/compare/scrunch-vs-trakkr` | {} | marketing | Named comparison. |
| `/compare/writesonic-vs-trakkr` | {} | marketing | Named comparison. |
| `/alternatives` | {} | marketing | Alternatives index. |
| `/alternatives/:slug` | `slug` | marketing | Generic alternatives page. |
| `/alternatives/ahrefs-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/aiclicks-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/airops-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/athenahq-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/brightedge-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/conductor-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/evertune-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/llm-pulse-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/llmrefs-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/mentions-so-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/nightwatch-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/otterly-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/peec-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/profound-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/profound-alternatives/cheap` | {} | marketing | Segment variant. |
| `/alternatives/profound-alternatives/for-agencies` | {} | marketing | Segment variant. |
| `/alternatives/profound-alternatives/small-business` | {} | marketing | Segment variant. |
| `/alternatives/profound-alternatives/startups` | {} | marketing | Segment variant. |
| `/alternatives/scrunch-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/semrush-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/seranking-alternatives` | {} | marketing | Named alternatives page. |
| `/alternatives/writesonic-alternatives` | {} | marketing | Named alternatives page. |
| `/reviews` | {} | marketing | Review index. |
| `/reviews/:reviewSlug/:childSlug` | `reviewSlug`, `childSlug` | marketing | Review sub-page. |
| `/reviews/ahrefs-review` | {} | marketing | Named review. |
| `/reviews/aiclicks-review` | {} | marketing | Named review. |
| `/reviews/athenahq-review` | {} | marketing | Named review. |
| `/reviews/brightedge-review` | {} | marketing | Named review. |
| `/reviews/conductor-review` | {} | marketing | Named review. |
| `/reviews/evertune-review` | {} | marketing | Named review. |
| `/reviews/llm-pulse-review` | {} | marketing | Named review. |
| `/reviews/llmrefs-review` | {} | marketing | Named review. |
| `/reviews/mentions-so-review` | {} | marketing | Named review. |
| `/reviews/nightwatch-review` | {} | marketing | Named review. |
| `/reviews/otterly-review` | {} | marketing | Named review. |
| `/reviews/peec-review` | {} | marketing | Named review. |
| `/reviews/profound-review` | {} | marketing | Named review. |
| `/reviews/scrunch-review` | {} | marketing | Named review. |
| `/reviews/semrush-review` | {} | marketing | Named review. |
| `/reviews/seranking-review` | {} | marketing | Named review. |
| `/reviews/writesonic-review` | {} | marketing | Named review. |

#### 1.6.2 Topic, guide, and article families

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/guide` | {} | marketing | Guide entry. |
| `/guides` | {} | marketing | Guide index. |
| `/guides/:slug` | `slug` | marketing | Generic guide. |
| `/guides/aeo-geo-roi` | {} | marketing | Named guide. |
| `/guides/ai-referral-traffic-vs-no-click-answers` | {} | marketing | Named guide. |
| `/guides/ai-search-attribution-model` | {} | marketing | Named guide. |
| `/guides/ai-search-executive-dashboard` | {} | marketing | Named guide. |
| `/guides/ai-visibility-kpis` | {} | marketing | Named guide. |
| `/guides/ai-visibility-leading-indicators` | {} | marketing | Named guide. |
| `/guides/ai-visibility-roi-attribution` | {} | marketing | Named guide. |
| `/guides/cmo-ai-visibility-reporting-template` | {} | marketing | Named guide. |
| `/guides/connect-ai-visibility-to-pipeline` | {} | marketing | Named guide. |
| `/guides/geo-tools-2026` | {} | marketing | Named guide. |
| `/guides/measure-revenue-from-ai-search` | {} | marketing | Named guide. |
| `/guides/what-is-aeo` | {} | marketing | Named guide. |
| `/guides/*` (11 more) | {} | marketing | Alias guides. All redirect - see section 2. |
| `/article/:slug` | `slug` | marketing | Generic article. |
| `/article/does-google-ai-overview-cite-my-site` | {} | marketing | Named article. |
| `/article/*` (15 more) | {} | marketing | Alias articles. All redirect - see section 2. |
| `/insights` | {} | marketing | Insight index. |
| `/insights/:slug` | `slug` | marketing | One insight. |
| `/ai-insights` | {} | marketing | AI insight index. |
| `/ai-insights/:platform/:category` | `platform`, `category` | marketing | Platform x category insight. |
| `/glossary` | {} | marketing | Glossary index. |
| `/glossary/:slug` | `slug` | marketing | One glossary term. |
| `/playbooks` | {} | marketing | Playbook index. |
| `/playbooks/:category` | `category` | marketing | Playbooks by category. |
| `/prompt-bank` | {} | marketing | Alias. Redirects to `/resources`. |
| `/prompt-bank/:category` | `category` | marketing | Prompt bank by category. |
| `/resources` | {} | marketing | Resource index. |
| `/resources/industry-tools` | {} | marketing | Industry tool index. |
| `/resources/industry-tools/:slug` | `slug` | marketing | One industry tool page. |
| `/industries` | {} | marketing | Industry index. |
| `/industries/:sector/:industry/:subIndustry` | 3 params | marketing | Industry taxonomy page. |
| `/market-reports` | {} | marketing | Market report index. |
| `/market-reports/:category` | `category` | marketing | One market report category. |
| `/state-of-ai-search` | {} | marketing | State of AI search report. |
| `/case-study` | {} | marketing | Alias to `/double`. |
| `/bots` | {} | marketing | Bot index. |
| `/bots/:slug` | `slug` | marketing | One bot profile. |
| `/source-intelligence` | {} | marketing | Source intelligence page. |
| `/openai-ads-mcp` | {} | marketing | OpenAI Ads MCP page. |
| `/mcp` | {} | marketing | MCP marketing page. |
| `/ai-poison` | {} | marketing | Campaign page. |
| `/answers` | {} | marketing | Answers layout parent. |
| `/answers` (index) | {} | marketing | Answers home. |
| `/answers/search` | {} | marketing | Answer search. |
| `/answers/category/:slug` | `slug` | marketing | Answers by category. |
| `/answers/:slug` | `slug` | marketing | One answer. |

#### 1.6.3 Brand-monitoring and product-topic pages

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/aeo` | {} | marketing | AEO topic page. |
| `/aeo-checker` | {} | marketing | AEO checker landing. |
| `/aeo-tool` | {} | marketing | Alias. Redirects to `/aeo`. |
| `/ai-analysis` | {} | marketing | AI analysis index. |
| `/ai-analysis/:slug` | `slug` | marketing | One AI analysis. |
| `/ai-brand-monitoring` | {} | marketing | Topic page. |
| `/ai-citation-tracking` | {} | marketing | Topic page. |
| `/ai-overview-tracking` | {} | marketing | Topic page. |
| `/ai-recommends` | {} | marketing | Recommendation index. |
| `/ai-recommends/:slug` | `slug` | marketing | One recommendation page. |
| `/ai-recommends/:category/:useCase` | 2 params | marketing | Category x use-case page. |
| `/ai-share-of-voice` | {} | marketing | Topic page. |
| `/ai-visibility` | {} | marketing | Topic page. |
| `/ai-visibility/:slug` | `slug` | marketing | One AI visibility page. |
| `/best-ai-visibility-tools` | {} | marketing | Listicle. |
| `/ai-visibility-tools` | {} | marketing | Alias. Redirects. |
| `/ai-visibility-trackers` | {} | marketing | Alias. Redirects. |
| `/google-ai-mode` | {} | marketing | Topic page. |
| `/google-ai-mode-tracking` | {} | marketing | Alias. Redirects. |
| `/google-ai-mode-visibility` | {} | marketing | Alias. Redirects. |
| `/grok` | {} | marketing | Grok topic page. |
| `/grok-monitoring` | {} | marketing | Alias. Redirects. |
| `/grok-tracking` | {} | marketing | Alias. Redirects. |
| `/products/grok-tracking` | {} | marketing | Alias. Redirects. |
| `/chatgpt-brand-monitoring` | {} | marketing | Topic page. |
| `/track-brand-mentions-across-ai-platforms` | {} | marketing | Topic page. |
| `/track-brand-mentions-in-chatgpt` | {} | marketing | Topic page. |
| `/track-brand-mentions-in-claude` | {} | marketing | Topic page. |
| `/track-brand-mentions-in-deepseek` | {} | marketing | Topic page. |
| `/track-brand-mentions-in-gemini` | {} | marketing | Topic page. |
| `/track-brand-mentions-in-grok` | {} | marketing | Topic page. |
| `/track-brand-mentions-in-meta-ai` | {} | marketing | Topic page. |
| `/track-brand-mentions-in-perplexity` | {} | marketing | Topic page. |
| `/chatgpt-ads` | {} | marketing | Alias. Redirects. |
| `/chatgpt-referral-conversion-rates` | {} | marketing | Data page. |
| `/chatgpt-traffic` | {} | marketing | Data page. |
| `/claude-traffic` | {} | marketing | Data page. |
| `/gemini-traffic` | {} | marketing | Data page. |
| `/perplexity-traffic` | {} | marketing | Data page. |
| `/ai-search-traffic` | {} | marketing | Data page. |
| `/ai-traffic-benchmarks-by-industry` | {} | marketing | Data page. |
| `/ai-crawler-market-share` | {} | marketing | Data page. |
| `/ai-citation-source-share` | {} | marketing | Data page. |
| `/llms-txt-generator` | {} | marketing | Alias. Redirects. |
| `/ai-share-of-voice-tool` | {} | marketing | Alias. Redirects. |
| `/looker-studio` | {} | marketing | Looker Studio landing. |
| `/audit/:slug` | `slug` | marketing | Public audit page. |
| `/fix` | {} | marketing | Fix index. |
| `/fix/:slug` | `slug` | marketing | One fix page. |
| `/a/:slug` | `slug` | marketing | Short-form page (a). |
| `/b/:slug` | `slug` | marketing | Short-form page (b). |
| `/d/:slug` | `slug` | marketing | Short-form page (d). |
| `/r/:code` | `code` | marketing | Referral redirect by code. |

#### 1.6.4 `/ai-search-tools` (nested)

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/ai-search-tools` (index) | {} | marketing | Tool directory home. |
| `/ai-search-tools/best` | {} | marketing | Best-of index. |
| `/ai-search-tools/best/:slug` | `slug` | marketing | One best-of list. |
| `/ai-search-tools/best/ai-visibility-tools` | {} | marketing | Alias. Redirects. |
| `/ai-search-tools/best/ai-search-optimization-tools` | {} | marketing | Alias. Redirects. |
| `/ai-search-tools/best/llm-seo-tools` | {} | marketing | Alias. Redirects. |
| `/ai-search-tools/best/ai-search-analytics-tools` | {} | marketing | Alias. Redirects. |
| `/ai-search-tools/best/answer-engine-optimization-software` | {} | marketing | Alias. Redirects. |
| `/ai-search-tools/best/generative-engine-optimization-software` | {} | marketing | Alias. Redirects. |
| `/ai-search-tools/best/tools-to-track-brand-mentions-in-ai` | {} | marketing | Alias. Redirects. |
| `/ai-search-tools/:tool` | `tool` | marketing | One tool profile. |

#### 1.6.5 `/best` (nested)

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/best` (index) | {} | marketing | Best-of directory home. |
| `/best/categories` | {} | marketing | Category index. |
| `/best/best-for` | {} | marketing | "Best for" index. |
| `/best/best-for/:lens` | `lens` | marketing | "Best for" by lens. |
| `/best/products` | {} | marketing | Product index. |
| `/best/products/:tool` | `tool` | marketing | One product. |
| `/best/compare` | {} | marketing | Comparison index. |
| `/best/compare/:pair` | `pair` | marketing | One pairwise comparison. |
| `/best/alternatives` | {} | marketing | Alternatives index. |
| `/best/alternatives/:tool` | `tool` | marketing | Alternatives to one tool. |
| `/best/movers` | {} | marketing | Movers list. |
| `/best/consensus` | {} | marketing | Consensus index. |
| `/best/consensus/:slug` | `slug` | marketing | One consensus page. |
| `/best/badge` | {} | marketing | Badge index. |
| `/best/badge/:tool` | `tool` | marketing | Badge for one tool. |
| `/best/how-ai-decides` | {} | marketing | Method explainer. |
| `/best/methodology` | {} | marketing | Methodology. |
| `/best/:category` | `category` | marketing | Category page. |
| `/best/:category/:segment` | 2 params | marketing | Category x segment page. |
| `/best/*` | splat | marketing | Catch-all inside `/best`. |

Note: `/best` at the top level also has a redirect rule. See section 2.

---

### 1.7 Cluster: research and data

#### 1.7.1 `/data` (nested; the Observatory)

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/data` (index) | {} | marketing | Data observatory home. |
| `/data/rankings` | {} | marketing | AI-500 style rankings. |
| `/data/movers` | {} | marketing | Biggest movers. |
| `/data/ai-500` | {} | marketing | Alias. Redirects to `/data/rankings`. |
| `/data/citations` | {} | marketing | Citation dataset. |
| `/data/citations/:domain` | `domain` | marketing | Citations for one domain. |
| `/data/content` | {} | marketing | Content dataset. |
| `/data/comparison-pages` | {} | marketing | Comparison-page dataset. |
| `/data/cite-to-recommend` | {} | marketing | Alias. Redirects to `/data/comparison-pages`. |
| `/data/owned-vs-earned` | {} | marketing | Owned vs earned dataset. |
| `/data/models` | {} | marketing | Model dataset. |
| `/data/crawlers` | {} | marketing | Crawler dataset. |
| `/data/crawlers/:bot` | `bot` | marketing | One crawler. |
| `/data/crawlers/google-extended` | {} | marketing | Alias. Redirects to `/bots/google-extended`. |
| `/data/security` | {} | marketing | Security dataset. |
| `/data/security/scan/:domain` | `domain` | marketing | Alias. Redirects to `/data/security`. |
| `/data/impostors` | {} | marketing | Alias. Redirects to `/data/security`. |
| `/data/ai-traffic` | {} | marketing | AI traffic dataset. |
| `/data/query-fanout` | {} | marketing | Query fan-out dataset. |
| `/data/web` | {} | marketing | Web-scale dataset. |
| `/data/research` | {} | marketing | Research index. |
| `/data/library` | {} | marketing | Alias. Redirects to `/data/research`. |
| `/data/brands/:slug` | `slug` | marketing | One brand profile. |
| `/data/industries` | {} | marketing | Industry index. |
| `/data/industries/:slug` | `slug` | marketing | One industry. |
| `/data/sectors/:slug` | `slug` | marketing | One sector. |
| `/data/agencies` | {} | marketing | Agency index. |
| `/data/agencies/:slug` | `slug` | marketing | One agency. |
| `/data/investors` | {} | marketing | Investor index. |
| `/data/investors/:slug` | `slug` | marketing | One investor. |
| `/data/compare` | {} | marketing | Comparison entry. |
| `/data/compare/:a` | `a` | marketing | Comparison with one side set. |
| `/data/compare/:a/vs/:b` | `a`, `b` | marketing | Pairwise comparison. |
| `/data/:view` | `view` | marketing | Generic view fallback. |

#### 1.7.2 `/bias` (nested)

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/bias` (index) | {} | marketing | Bias-in-AI study home. |
| `/bias/findings` | {} | marketing | Findings. |
| `/bias/models` | {} | marketing | Model index. |
| `/bias/models/:slug` | `slug` | marketing | One model. |
| `/bias/questions` | {} | marketing | Question index. |
| `/bias/questions/:slug` | `slug` | marketing | One question. |
| `/bias/worldview` | {} | marketing | Worldview view. |
| `/bias/worldview/:mode` | `mode` | marketing | Worldview by mode. |
| `/bias/atlas` | {} | marketing | Atlas view. |
| `/bias/atlas/:mode` | `mode` | marketing | Atlas by mode. |
| `/bias/method` | {} | marketing | Method. |
| `/bias/method/technical` | {} | marketing | Technical method. |
| `/bias/compare` | {} | marketing | Comparison entry. |
| `/bias/compare/:a/vs/:b` | `a`, `b` | marketing | Pairwise comparison. |
| `/bias/quiz` | {} | marketing | Quiz. |
| `/bias/figures` | {} | marketing | Figures. |
| `/bias/:view` | `view` | marketing | Generic view fallback. |

#### 1.7.3 `/trakkr-research`

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/trakkr-research` | {} | marketing | Research hub. |
| `/trakkr-research/categories` | {} | marketing | Category index. |
| `/trakkr-research/categories/:slug` | `slug` | marketing | One category. |
| `/trakkr-research/authors/:slug` | `slug` | marketing | One author. |
| `/trakkr-research/intents/:slug` | `slug` | marketing | One intent. |
| `/trakkr-research/sources` | {} | marketing | Source index. |
| `/trakkr-research/sources/:domain` | `domain` | marketing | One source domain. |
| `/trakkr-research/sharing` | {} | marketing | Sharing page. |
| `/trakkr-research/citation-sources` | {} | marketing | Study: citation sources. |
| `/trakkr-research/citation-decay` | {} | marketing | Study: citation decay. |
| `/trakkr-research/citation-decay/linkedin` | {} | marketing | LinkedIn card variant. |
| `/trakkr-research/cited-not-chosen` | {} | marketing | Study: cited but not chosen. |
| `/trakkr-research/citation-leakage` | {} | marketing | Alias. Redirects to `cited-not-chosen`. |
| `/trakkr-research/anatomy-of-an-ai-citation` | {} | marketing | Study. |
| `/trakkr-research/anatomy-of-an-ai-citation/linkedin` | {} | marketing | LinkedIn card variant. |
| `/trakkr-research/crawler-behavior` | {} | marketing | Study. |
| `/trakkr-research/crawler-behavior/linkedin` | {} | marketing | LinkedIn card variant. |
| `/trakkr-research/query-translation` | {} | marketing | Study. |
| `/trakkr-research/query-translation/linkedin` | {} | marketing | LinkedIn card variant. |
| `/trakkr-research/llmstxt-effect` | {} | marketing | Study. |
| `/trakkr-research/markdown-crawler-experiment` | {} | marketing | Study. |
| `/trakkr-research/model-divergence` | {} | marketing | Study. |
| `/trakkr-research/page-type-performance` | {} | marketing | Study. |
| `/trakkr-research/:studySlug/answers` | `studySlug` | marketing | Answers for one study. |
| `/trakkr-research/:studySlug/answers/:slug` | 2 params | marketing | One answer. |
| `/trakkr-research/:studySlug/facts/:slug` | 2 params | marketing | One fact. |
| `/trakkr-research/:studySlug/trackers/:slug` | 2 params | marketing | One tracker. |
| `/trakkr-research/image-showcase` | {} | internal | Image showcase. |
| `/trakkr-research/image-showcase-002` | {} | internal | Image showcase. |
| `/trakkr-research/image-showcase-003` | {} | internal | Image showcase. |
| `/trakkr-research/image-showcase-004` | {} | internal | Image showcase. |
| `/trakkr-research/image-showcase-010` | {} | internal | Image showcase. |

#### 1.7.4 Legacy rankings and observatory aliases

All of these redirect. See section 2.

`/observatory`, `/observatory/*`, `/ai-500`, `/rankings`, `/rankings/ai-500`, `/rankings/methodology`, `/rankings/brand/:slug`, `/rankings/brands/:slug`, `/rankings/company/:slug`, `/rankings/companies/:slug`, `/rankings/agency/:slug`, `/rankings/agencies/:slug`, `/rankings/investor/:slug`, `/rankings/investors/:slug`, `/rankings/vc/:slug`, `/rankings/vcs/:slug`, `/rankings/industry/:slug`, `/rankings/industries/:slug`, `/rankings/category/:slug`, `/rankings/categories/:slug`, `/rankings/sector/:slug`, `/rankings/sectors/:slug`, `/rankings/compare/:a/:b`, `/rankings/compare/:a/vs/:b`, `/console/*`.

---

### 1.8 Cluster: free tools

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/free-tools` | {} | marketing | Free tool index. |
| `/free-tools/aeo-checker` | {} | marketing | AEO checker. |
| `/free-tools/ai-rank-tracker` | {} | marketing | AI rank tracker. |
| `/free-tools/ai-rank-tracker/:domain` | `domain` | marketing | Rank tracker result. |
| `/free-tools/ai-site-grader` | {} | marketing | Site grader. |
| `/free-tools/ai-site-grader/:domain` | `domain` | marketing | Site grader result. |
| `/free-tools/ai-share-of-voice` | {} | marketing | Share of voice tool. |
| `/free-tools/llms-txt-generator` | {} | marketing | llms.txt generator. |
| `/free-tools/llms-txt-generator/:domain` | `domain` | marketing | Generator result. |
| `/free-tools/chatgpt-ads-context-hints` | {} | marketing | ChatGPT ads context hints. |
| `/free-tools/chatgpt-ads-context-hints/:domain` | `domain` | marketing | Result for one domain. |
| `/free-tools/profound-pricing-calculator` | {} | marketing | Competitor pricing calculator. |
| `/free-tools/url-optimizer` | {} | marketing | Alias. Redirects. |
| `/free-tools/ai-citation-source-share` | {} | marketing | Alias. Redirects. |
| `/free-tools/ai-crawler-market-share` | {} | marketing | Alias. Redirects. |
| `/free-tools/ai-search-traffic` | {} | marketing | Alias. Redirects. |
| `/free-tools/ai-traffic-benchmarks-by-industry` | {} | marketing | Alias. Redirects. |
| `/free-tools/chatgpt-referral-conversion-rates` | {} | marketing | Alias. Redirects. |
| `/free-tools/chatgpt-traffic` | {} | marketing | Alias. Redirects. |
| `/free-tools/claude-traffic` | {} | marketing | Alias. Redirects. |
| `/free-tools/gemini-traffic` | {} | marketing | Alias. Redirects. |
| `/free-tools/perplexity-traffic` | {} | marketing | Alias. Redirects. |

---

### 1.9 Cluster: docs (`/learn`)

`/learn` is a layout route with 35 children. Its index redirects to `/learn/docs`.

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/learn` (index) | {} | marketing | Redirects to `/learn/docs`. |
| `/learn/docs` | {} | marketing | Documentation home. |
| `/learn/docs/*` | splat | marketing | Any documentation page. |
| `/learn/api` | {} | marketing | API reference home. |
| `/learn/api/introduction` | {} | marketing | API introduction. |
| `/learn/api/authentication` | {} | marketing | API authentication. |
| `/learn/api/rate-limits` | {} | marketing | API rate limits. |
| `/learn/api/errors` | {} | marketing | API errors. |
| `/learn/api/mcp` | {} | marketing | MCP server documentation. |
| `/learn/api/mcp/recipes` | {} | marketing | MCP cookbook. |
| `/learn/api/endpoints/brands` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/scores` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/prompts` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/citations` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/competitors` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/rankings` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/models` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/opportunities` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/export` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/prism` | {} | marketing | Endpoint page (AI Pages). |
| `/learn/api/endpoints/webhooks` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/crawler` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/content-ideas` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/pool-results-pages` | {} | marketing | Endpoint page (pool, results, pages). |
| `/learn/api/endpoints/pool-proof-pages` | {} | marketing | Alias. Redirects to `pool-results-pages`. |
| `/learn/api/endpoints/reports` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/perception` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/narratives` | {} | marketing | Endpoint page. |
| `/learn/api/endpoints/diagnose` | {} | marketing | Endpoint page. |
| `/learn/api/*` | splat | marketing | API catch-all. |
| `/learn/api/playground` | {} | marketing | API playground (defined outside the `/learn` layout). |
| `/learn/whats-new` | {} | marketing | What is new. |
| `/learn/how-to` | {} | marketing | How-to index. |
| `/learn/how-to/:slug` | `slug` | marketing | One how-to. |
| `/learn/academy` | {} | marketing | Alias. Redirects to `/learn/docs`. |
| `/learn/academy/:slug` | `slug` | marketing | Alias. Redirects to `/learn/docs`. |
| `/learn/academy/*` | splat | marketing | Alias. Redirects to `/learn/docs`. |
| `/learn/certificate/:shareToken` | `shareToken` | marketing | Alias. Redirects to `/learn/docs`. |
| `/learn/ai-crawler-access` | {} | marketing | Alias. Redirects into the docs tree. |
| `/docs` | {} | marketing | Alias. Redirects to `/learn/docs`. |
| `/docs/*` | splat | marketing | Alias. Redirects into `/learn/docs`. |
| `/docs/api` | {} | marketing | Alias. Redirects to `/learn/api`. |
| `/docs/api/*` | splat | marketing | Alias. Redirects into `/learn/api`. |
| `/docs/errors` | {} | marketing | Alias. Redirects to `/learn/api/errors`. |
| `/api` | {} | marketing | Alias. Redirects to `/learn/api`. |
| `/api/*` | splat | marketing | Alias. Redirects into `/learn/api`. |

---

### 1.10 Cluster: auth, invite, and public share

See section 5 for the full description of each.

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `/login` | {} | public | Sign in. |
| `/logout` | {} | public | Sign out. |
| `/signup` | {} | public | Alias. Redirects to `/start`. |
| `/start` | {} | public | Signup and first-run entry. |
| `/start-onboarding` | {} | public | Alias. Redirects to `/start`. |
| `/start-onboarding/*` | splat | public | Alias. Redirects to `/start`. |
| `/reset-password` | {} | public | Password reset. |
| `/sso/start` | {} | public | SSO entry. |
| `/auth/post-login` | {} | auth-callback | Post-login landing (constant `HI`). |
| `/auth/portal-callback` | {} | auth-callback | Client-portal auth return. |
| `/auth/github/callback` | {} | auth-callback | GitHub OAuth return. |
| `/auth/wordpress/callback` | {} | auth-callback | WordPress OAuth return. |
| `/auth/work-item/callback` | {} | auth-callback | Work-item tracker OAuth return. |
| `/auth/crawler/vercel/callback` | {} | auth-callback | Vercel crawler-connect return. |
| `/auth/crawler/netlify/callback` | {} | auth-callback | Netlify crawler-connect return. |
| `/oauth/gmail/complete` | {} | auth-callback | Gmail OAuth completion. |
| `/oauth/consent` | {} | auth-callback | OAuth consent screen (MCP / API clients). |
| `/invite/:token` | `token` | public | Team invite acceptance. |
| `/client-invite/:token` | `token` | public | Client-portal invite acceptance. |
| `/client/login` | {} | public | Client-portal sign in. |
| `/client/forgot-password` | {} | public | Client-portal reset request. |
| `/client/reset-password` | {} | public | Client-portal reset. |
| `/pub/:slug` | `slug` | public-share | Public shared dashboard. |
| `/report/:slug` | `slug` | public-share | Public shared report. |
| `/pitch/:slug` | `slug` | public-share | Public agency pitch. |
| `/pitch/:slug/print` | `slug` | public-share | Print layout of a pitch. |
| `/demo/:slug` | `slug` | public-share | Public demo (same component as pitch). |
| `/survey/:slug` | `slug` | public-share | Public survey. |
| `/survey/:slug/claim` | `slug` | public-share | Survey reward claim. |
| `/r/:code` | `code` | public-share | Referral code redirect. |
| `/proposals/woodrow` | {} | public-share | Named proposal. |
| `/proposals/woodrow/dashboard` | {} | public-share | Named proposal dashboard. |

---

### 1.11 Cluster: internal, showcase, and development

**These routes exist in the shipped bundle. They are not part of the product. Do not replicate them.**

| Full path | Params | Purpose |
|---|---|---|
| `/internal/ai-search-attribution` | {} | Internal. Attribution deck. |
| `/internal/case-studies` | {} | Internal. Case study deck. |
| `/internal/citation-leakage-linkedin-cards` | {} | Internal. Social card generator. |
| `/internal/data-launch-cards` | {} | Internal. Social card generator. |
| `/internal/double-card` | {} | Internal. Social card generator. |
| `/internal/emails` | {} | Internal. Email template preview. |
| `/internal/gtm` | {} | Internal. Go-to-market page. |
| `/internal/lens` | {} | Internal. Lens board. |
| `/internal/linkedin` | {} | Internal. LinkedIn assets. |
| `/internal/linkedin-cards` | {} | Internal. LinkedIn card generator. |
| `/internal/linkedin-content-calendar` | {} | Internal. Content calendar. |
| `/internal/onboarding-preview` | {} | Internal. Onboarding preview. |
| `/internal/openai-ads-mcp-linkedin-cards` | {} | Internal. Card generator. |
| `/internal/prompts-worth-winning` | {} | Internal. Prompt research deck. |
| `/internal/research` | {} | Internal. Research deck. |
| `/internal/research-linkedin-cards` | {} | Internal. Card generator. |
| `/internal/source-map` | {} | Internal. Source map. |
| `/internal/surveys/:slug` | `slug` | Internal. Survey preview. |
| `/showcase/*` (63 routes) | {} | Design-system showcases. Full list below. |
| `/agent-cards` | {} | Showcase. |
| `/agent-showcase` | {} | Showcase. |
| `/background-showcase` | {} | Showcase. |
| `/email-showcase` | {} | Showcase. |
| `/email/showcase` | {} | Showcase. |
| `/first-scan-showcase` | {} | Showcase. |
| `/hero-showcase` | {} | Showcase. |
| `/landing-showcase` | {} | Showcase. |
| `/signal-showcase` | {} | Showcase. |
| `/linkedin-banners` | {} | Showcase. |
| `/linkedin-carousel` | {} | Showcase. |
| `/blog/claude-code-image-showcase` | {} | Showcase. |
| `/mcp-email-assets/showcase.html` | {} | Static showcase asset. |
| `/components` | {} | Component gallery. |
| `/design`, `/design/unity`, `/unity` | {} | Design-system surfaces. |
| `/workflow-tests` | {} | Admin test harness. |
| `/qa` | {} | QA surface. |
| `/trakkr-research/image-showcase*` (5) | {} | Image showcases. |

Full `/showcase` list: `accuracy-v2`, `action-card-review`, `action-cards`, `action-detail`, `actions-desk`, `actions-desk-v2`, `actions-desk-v3`, `actions-desk-v4`, `agent-blocks`, `agent-chart`, `agent-experience`, `agent-workspace`, `aha-card`, `automations-v3`, `brand-report`, `cancellation`, `card-wall`, `citations-refresh`, `conversations`, `create-header`, `data-display-system`, `data-observatory`, `data-provenance`, `detail-drawers`, `embedded-checkout`, `embedded-checkout-live`, `evidence`, `forms-and-controls`, `header-grammar`, `improve-section`, `journey-language`, `landing-2026`, `landing-polish`, `loading`, `mega-menu`, `menu-icons`, `motion-system`, `nav-ask`, `nav-compare`, `navigation-controls`, `onboarding-v3-current`, `onboarding-v3-polish`, `optimize-v2`, `overlay-system`, `page-shells`, `pitch-editor`, `pitch-generating`, `pitch-list`, `pitch-print`, `pitch-report`, `pitch-share`, `prompt-drawer`, `reddit-directions`, `setup-frame`, `ship-demo`, `sidebar-mockup`, `sidebars`, `svg`, `system-states`, `track`, `upgrade-recap`.

---

### 1.12 Catch-all

| Full path | Params | Auth | Purpose |
|---|---|---|---|
| `*` | splat | public | Any unmatched path redirects to `/`. |

---

## 2. Redirect map

### 2.1 Verified by navigation

Each row was tested in the live application. The final path is `location.pathname + location.search` after the router settled.

| Requested path | Final path |
|---|---|
| `/workflows` | `/automations` |
| `/prism` | `/ai-pages` |
| `/narratives` | `/perception?tab=narratives` |
| `/accuracy` | `/dashboard` |
| `/fact-accuracy` | `/dashboard` |
| `/playbook` | `/dashboard` |
| `/audiences` | `/prompts?tab=personas` |
| `/outreach` | `/citations?view=outreach` |
| `/brands` | `/settings?tab=brands` |
| `/crawler` | `/traffic/crawler` |
| `/crawlers` | `/traffic/crawler` |
| `/crawler/sources` | `/traffic/crawler/sources` |
| `/tracking` | `/traffic/analytics` |
| `/tracking/analytics` | `/traffic/analytics` |
| `/tracking/crawler` | `/traffic/crawler` |
| `/tracking/search-console` | `/traffic/search-console` |
| `/traffic` | `/traffic/analytics` |
| `/content` | `/create` |
| `/connect` | `/integrate` |
| `/exports` | `/integrate` |
| `/exports/csv` | `/exports/csv` (no redirect) |
| `/exports/sheets` | `/exports/sheets` (no redirect) |
| `/exports/looker-studio` | `/exports/looker-studio` (no redirect) |
| `/exports/api-keys` | `/exports/api-keys` (no redirect) |
| `/integrations/export` | `/exports/csv` |
| `/integrations/sheets` | `/exports/sheets` |
| `/integrations/looker-studio` | `/exports/looker-studio` |
| `/integrations/api-keys` | `/exports/api-keys` |
| `/workflows/integrations` | `/integrate` |
| `/queries` | `/research` |
| `/research/results` | `/research` |
| `/results/quarter` | `/results/quarter` (no redirect) |
| `/proof` | `/actions?view=results` |
| `/proof/quarter` | `/results/quarter` |
| `/citations2` | `/citations` |
| `/locations` | `/locations` (no redirect) |
| `/app` | `/dashboard` |
| `/dashboard/double` | `/dashboard/double` (no redirect) |
| `/double` | `/double` (no redirect) |
| `/share` | `/share` (no redirect) |
| `/business-case` | `/business-case` (no redirect) |
| `/agency/compare` | `/agency?view=compare` |
| `/agency/reporting` | `/agency/reports` |
| `/agency/pdf-export` | `/agency/reports?tab=history` |
| `/docs` | `/learn/docs` |

Notes on three rows:
- `/workflows`, `/accuracy`, and `/playbook` are declared as real routes in the router. They still resolve to a different page. The redirect comes from a feature gate or a surface wrapper at render time, not from a `<Navigate>` element. Replication must reproduce the gate, not a static rewrite.
- `/exports/csv`, `/exports/sheets`, `/exports/looker-studio`, and `/exports/api-keys` are the redirect targets. They do not redirect themselves.
- `/locations`, `/dashboard/double`, `/double`, `/share`, and `/business-case` are real pages. The task brief listed them as possible aliases. They are not aliases.

### 2.2 Declared in the router but not exercised by navigation

These are `<Navigate>` elements read directly from the route table. They are authoritative but were not each clicked through.

| Requested path | Final path |
|---|---|
| `/app/*` | `/dashboard` |
| `/api` | `/learn/api` |
| `/api/*` | `/learn/api` + remaining segments |
| `/docs/*` | `/learn/docs` + remaining segments |
| `/docs/api` | `/learn/api` |
| `/docs/api/*` | `/learn/api` + remaining segments |
| `/docs/errors` | `/learn/api/errors` |
| `/learn` (index) | `/learn/docs` |
| `/learn/academy` | `/learn/docs` |
| `/learn/academy/:slug` | `/learn/docs` |
| `/learn/academy/*` | `/learn/docs` |
| `/learn/certificate/:shareToken` | `/learn/docs` |
| `/learn/ai-crawler-access` | `/learn/docs/features/traffic/crawlers/behind-a-waf` |
| `/learn/api/endpoints/pool-proof-pages` | `/learn/api/endpoints/pool-results-pages` |
| `/signup` | `/start` |
| `/start-onboarding` | `/start` |
| `/start-onboarding/*` | `/start` |
| `/fact-accuracy/print` | `/accuracy/print` |
| `/client/audiences` | `/client/prompts?tab=personas` |
| `/console/*` | `/open-source` + remaining segments |
| `/observatory` | `/data` |
| `/observatory/*` | `/data` + remaining segments |
| `/ai-500` | `/data/rankings` |
| `/data/ai-500` | `/data/rankings` |
| `/rankings` | `/data/rankings` |
| `/rankings/ai-500` | `/data/rankings` |
| `/rankings/methodology` | `/data/rankings` |
| `/rankings/brand/:slug` | `/data/brands/:slug` |
| `/rankings/brands/:slug` | `/data/brands/:slug` |
| `/rankings/company/:slug` | `/data/brands/:slug` |
| `/rankings/companies/:slug` | `/data/brands/:slug` |
| `/rankings/agency/:slug` | `/data/agencies/:slug` |
| `/rankings/agencies/:slug` | `/data/agencies/:slug` |
| `/rankings/investor/:slug` | `/data/investors/:slug` |
| `/rankings/investors/:slug` | `/data/investors/:slug` |
| `/rankings/vc/:slug` | `/data/investors/:slug` |
| `/rankings/vcs/:slug` | `/data/investors/:slug` |
| `/rankings/industry/:slug` | `/data/industries/:slug` |
| `/rankings/industries/:slug` | `/data/industries/:slug` |
| `/rankings/category/:slug` | `/data/industries/:slug` |
| `/rankings/categories/:slug` | `/data/industries/:slug` |
| `/rankings/sector/:slug` | `/data/sectors/:slug` |
| `/rankings/sectors/:slug` | `/data/sectors/:slug` |
| `/data/cite-to-recommend` | `/data/comparison-pages` |
| `/data/crawlers/google-extended` | `/bots/google-extended` |
| `/data/security/scan/:domain` | `/data/security` |
| `/data/impostors` | `/data/security` |
| `/data/library` | `/data/research` |
| `/best` (top level) | `/ai-search-tools` |
| `/ai-search-tools/best/ai-visibility-tools` | `/best-ai-visibility-tools` |
| `/ai-search-tools/best/ai-search-optimization-tools` | `/best-ai-visibility-tools` |
| `/ai-search-tools/best/llm-seo-tools` | `/best-ai-visibility-tools` |
| `/ai-search-tools/best/ai-search-analytics-tools` | `/best-ai-visibility-tools` |
| `/ai-search-tools/best/answer-engine-optimization-software` | `/compare/aeo-tools-2026` |
| `/ai-search-tools/best/generative-engine-optimization-software` | `/guides/geo-tools-2026` |
| `/ai-search-tools/best/tools-to-track-brand-mentions-in-ai` | `/ai-search-tools/best/ai-brand-monitoring-tools` |
| `/enterprise` | `/trakkr-for/enterprise` |
| `/case-study` | `/double` |
| `/prompt-bank` | `/resources` |
| `/ai-visibility-tools` | `/best-ai-visibility-tools` |
| `/ai-visibility-trackers` | `/best-ai-visibility-tools` |
| `/features/ai-citation-tracking` | `/ai-citation-tracking` |
| `/google-ai-mode-tracking` | `/google-ai-mode` |
| `/google-ai-mode-visibility` | `/google-ai-mode` |
| `/aeo-tool` | `/aeo` |
| `/grok-monitoring` | `/grok` |
| `/grok-tracking` | `/grok` |
| `/products/grok-tracking` | `/grok` |
| `/chatgpt-ads` | `/free-tools/chatgpt-ads-context-hints` |
| `/llms-txt-generator` | `/free-tools/llms-txt-generator` |
| `/ai-share-of-voice-tool` | `/free-tools/ai-share-of-voice` |
| `/free-tools/url-optimizer` | `/free-tools/ai-site-grader` |
| `/free-tools/chatgpt-traffic` | `/chatgpt-traffic` |
| `/free-tools/claude-traffic` | `/claude-traffic` |
| `/free-tools/gemini-traffic` | `/gemini-traffic` |
| `/free-tools/perplexity-traffic` | `/perplexity-traffic` |
| `/free-tools/ai-search-traffic` | `/ai-search-traffic` |
| `/free-tools/ai-traffic-benchmarks-by-industry` | `/ai-traffic-benchmarks-by-industry` |
| `/free-tools/chatgpt-referral-conversion-rates` | `/chatgpt-referral-conversion-rates` |
| `/free-tools/ai-crawler-market-share` | `/ai-crawler-market-share` |
| `/free-tools/ai-citation-source-share` | `/ai-citation-source-share` |
| `/trakkr-research/citation-leakage` | `/trakkr-research/cited-not-chosen` |
| `/guides/perplexity-brand-monitoring` | `/track-brand-mentions-in-perplexity` |
| `/guides/chatgpt-brand-monitoring` | `/track-brand-mentions-in-chatgpt` |
| `/guides/claude-brand-monitoring` | `/track-brand-mentions-in-claude` |
| `/guides/gemini-brand-monitoring` | `/track-brand-mentions-in-gemini` |
| `/guides/grok-brand-monitoring` | `/track-brand-mentions-in-grok` |
| `/guides/ai-citation-gap-analysis` | `/guides/citation-gap-analysis` |
| `/guides/competitor-citation-gap-checker` | `/guides/citation-gap-analysis` |
| `/guides/how-to-close-an-ai-citation-gap` | `/guides/citation-gap-analysis` |
| `/guides/best-ai-visibility-tools` | `/best-ai-visibility-tools` |
| `/guides/track-brand-mentions-across-ai-models` | `/track-brand-mentions-across-ai-platforms` |
| `/guides/best-aeo-tools` | `/compare/aeo-tools-2026` |
| `/guides/answer-engine-optimization-tools` | `/compare/aeo-tools-2026` |
| `/guides/ai-overviews-tracking` | `/ai-overview-tracking` |
| `/article/track-mentions-in-chatgpt` | `/track-brand-mentions-in-chatgpt` |
| `/article/monitor-brand-mentions-in-chatgpt` | `/track-brand-mentions-in-chatgpt` |
| `/article/brand-accuracy-monitoring-in-chatgpt` | `/track-brand-mentions-in-chatgpt` |
| `/article/check-if-ai-overviews-cites-my-site` | `/article/does-google-ai-overview-cite-my-site` |
| `/article/monitor-brand-mentions-in-perplexity` | `/track-brand-mentions-in-perplexity` |
| `/article/monitor-brand-mentions-in-gemini` | `/track-brand-mentions-in-gemini` |
| `/article/track-mentions-in-gemini` | `/track-brand-mentions-in-gemini` |
| `/article/competitive-citation-gap-analysis-for-ai-overviews` | `/guides/citation-gap-analysis` |
| `/article/competitive-citation-gap-analysis-for-chatgpt` | `/guides/citation-gap-analysis` |
| `/article/competitive-citation-gap-analysis-for-claude` | `/guides/citation-gap-analysis` |
| `/article/competitive-citation-gap-analysis-for-gemini` | `/guides/citation-gap-analysis` |
| `/article/competitive-citation-gap-analysis-for-perplexity` | `/guides/citation-gap-analysis` |
| `/article/competitive-citation-gap-analysis-for-grok` | `/guides/citation-gap-analysis` |
| `/article/competitive-citation-gap-analysis-for-deepseek` | `/guides/citation-gap-analysis` |
| `/article/competitive-citation-gap-analysis-for-llama` | `/guides/citation-gap-analysis` |
| `*` | `/` |

---

## 3. API surface

### 3.1 Base URL and transport

| Item | Value |
|---|---|
| Base URL | `https://api.trakkr.ai` |
| Documented base URL | `https://api.trakkr.ai` (stated on `/learn/api`) |
| Auth header | `Authorization: Bearer <token>` |
| Browser token | Supabase JWT from `localStorage["sb-vhdphutoswgscnkskrcj-auth-token"].access_token` |
| Supabase project ref | `vhdphutoswgscnkskrcj` |
| API key format (REST) | `sk_live_...` (Scale plan and above) |
| MCP connect token format | `mcp_connect_...` (every paid plan) |
| Client helper | `api.get/post/postForm/patch/put/delete(path)` wrapping `fetch` with retry and one silent 401 refresh |
| Analytics ingest | `https://trakkr.ai/ingest/capture/` (PostHog proxy at `e.trakkr.ai`) |

Two path conventions coexist. Most endpoints have no prefix (`/prompts`, `/citations/{brandId}`). A smaller legacy set is served under `/api/...` on the same host (`/api/perception/story`, `/api/reports/generate`).

### 3.2 Endpoints exercised by the signed-in account

Method is `GET` unless the client code shows otherwise. Query strings are shown as observed.

| Method | Path | Called by | Response top-level keys |
|---|---|---|---|
| GET | `/auth/session` | /dashboard (bootstrap) | NOT OBSERVED (returns 404 when called without the app's own headers) |
| GET | `/subscription/effective` | /dashboard (bootstrap) | `plan`, `plan_cycle`, `subscription_status`, `billing_model`, `billing_source`, `contract_id`, `contract_status`, `managed_contract`, `brand_limit`, `white_label_slot_limit`, `white_label_access`, `agency_workspace_access`, `extra_brands`, `extra_prompts`, `extra_markets`, `prompt_limit`, `in_grace_period`, `trial_ends_at`, `is_paid`, `is_active`, `is_trialing`, `is_paused`, `is_refresh_paused`, `scale_trial_ends_at`, `is_scale_trial`, `is_scale_trial_grace`, `is_scale_tier`, `workflow_limit`, `snapshot_limit`, `has_crawler`, `has_citations`, `has_data_export`, `has_shared_dashboards`, `has_prism`, `has_tracking_pixel`, `has_agent`, `has_competitors`, `has_page_analysis`, `has_workflows`, `has_team_access`, `team_seat_limit`, `has_api_access`, `has_mcp_access`, `has_looker_integration`, `has_reddit`, `reddit_subreddit_limit`, `reddit_trigger_limit`, `reddit_history_days`, `reddit_drafts_per_month`, `has_narratives`, `narrative_limit`, `market_limit`, `unity_optimize_endstate_enabled` |
| GET | `/subscription/sync?force=false` | /dashboard | NOT OBSERVED |
| GET | `/subscription/downgrade-changes` | /dashboard | NOT OBSERVED |
| GET | `/subscription/details` | /settings | NOT OBSERVED |
| GET | `/subscription/article-credits?user_id={id}&brand_id={brandId}` | /create | NOT OBSERVED |
| GET | `/users/admin-access` | /dashboard | NOT OBSERVED |
| GET | `/users/me/mcp-token/sessions` | /dashboard | NOT OBSERVED |
| GET | `/users/me/api-key` | /integrate | NOT OBSERVED |
| GET | `/brand-groups` | /dashboard | `groups`, `total` |
| GET | `/client/group-brands` | /dashboard | NOT OBSERVED |
| GET | `/brands/{brandId}/first-report-status` | /dashboard | NOT OBSERVED |
| GET | `/brands/{brandId}/markets` | /dashboard | NOT OBSERVED |
| GET | `/brands/{brandId}/personas?range=30d` | /dashboard | NOT OBSERVED |
| GET | `/brands/{brandId}/topics` | /prompts | NOT OBSERVED |
| GET | `/brands/{brandId}/aliases` | /competitors | NOT OBSERVED |
| GET | `/brands/{brandId}/sample-paths` | /traffic/crawler | NOT OBSERVED |
| GET | `/prompts?brand_id={brandId}` | /dashboard, /prompts | Array of prompt objects. Item keys: `id`, `brand_id`, `text`, `active`, `created_at`, `category`, `intent` |
| GET | `/prompts/variant-analysis?brand_id={brandId}` | /prompts | NOT OBSERVED |
| GET | `/prompts/{brandId}/health` | /prompts | NOT OBSERVED |
| GET | `/prompts/{brandId}/overtakes` | /prompts | NOT OBSERVED |
| GET | `/suggestions/brand/{brandId}` | /prompts | NOT OBSERVED |
| GET | `/citations/{brandId}?limit=50&provider_schema=providers-v5&cache_policy=empty-no-store-v1` | /dashboard (limit 50), /citations (limit 200) | `summary`, `top_domains`, `top_competitors`, `citations`, `snapshot_available`, `processing` |
| GET | `/citations/{brandId}/history?days=28` | /dashboard | NOT OBSERVED |
| GET | `/citations/{brandId}/gsc` | /actions | NOT OBSERVED |
| GET | `/competitors/{brandId}/all?days=14` | /dashboard | `overview`, `head_to_head`, `arena`, `threats`, `by_llm` |
| GET | `/competitors/{brandId}/hidden` | /dashboard | NOT OBSERVED |
| GET | `/competitors/{brandId}` | /create | NOT OBSERVED |
| GET | `/competitor-groups/{brandId}` | /competitors | NOT OBSERVED |
| GET | `/rankings/{brandId}?days=14&include_all=true` | /dashboard | `your_rank`, `total_competitors`, `your_visibility`, `your_visibility_change`, `win_rate`, `threat_count`, `rankings`, `all_competitors`, `your_trend`, `prompt_position_trends`, `available_models`, `last_updated`, `data_through`, `computed_at`, `total_prompts`, `total_opportunities`, `attempted_results`, `successful_results`, `failed_results`, `prompt_population_signature` |
| GET | `/rankings/{brandId}?days=30&compact=true` | /actions | Same shape, compact |
| GET | `/actions?brand_id={brandId}&status=open&scope=latest&sort_by=priority_score&sort_dir=desc&page=1&per_page=50` | /dashboard | `items`, `total`, `page`, `per_page`, `generation` |
| GET | `/actions?brand_id={brandId}&status=pending&sort_by=priority_score&sort_dir=desc&per_page=20` | /agent | Same shape |
| GET | `/actions/stats?brand_id={brandId}` | /dashboard | `total_pending`, `total_in_progress`, `total_completed`, `total_dismissed`, `total_snoozed`, `quick_wins`, `completion_rate`, `completed_this_week`, `by_type`, `by_category`, `by_source`, `last_generated_at`, `has_new_report_data`, `is_generating`, `synthesis_age_hours`, `latest_generation`, `latest_report_at`, `has_completed_reports`, `latest_report_is_today`, `brand_active`, `synthesis_eligible`, `synthesis_block_reason` |
| GET | `/actions/preferences?brand_id={brandId}` | /dashboard | NOT OBSERVED |
| GET | `/actions/briefing?brand_id={brandId}` | /actions | NOT OBSERVED |
| GET | `/opportunity-pool?brand_id={brandId}&limit=500` | /actions | `items`, `meta`, `counts` |
| GET | `/opportunity-pool?brand_id={brandId}&kind=audit_fix,audit_issue,audit_check&limit=6` | /optimize | Same shape |
| GET | `/opportunity-pool?brand_id={brandId}&limit=1` | /agent | Same shape |
| GET | `/proof/feed?brand_id={brandId}&since=<iso>` | /actions | `items`, `meta`, `verdict_counts`, `stage_counts`, `new_judged_count`, `self_benchmark`, `first_earned_id` |
| GET | `/proof/feed?brand_id={brandId}` | /optimize | Same shape |
| GET | `/proof/feed?brand_id={brandId}&stage=judged` | /agent | Same shape |
| GET | `/api/perception/story?brand_id={brandId}` | /dashboard | `run_date`, `brand_id`, `total_prompts_analyzed`, `total_responses_processed`, `narrative`, `perception_score`, `perception_percentile`, `perception_change_7d`, `semantic_dna`, `use_case_mapping`, `perception_gaps`, `common_concerns`, `category_scores`, `model_breakdown`, `recommendations`, `top_cited_domains`, `source_perception_map`, `competitor_narratives` |
| GET | `/api/circulation-templates?brand_id={brandId}` | /dashboard | NOT OBSERVED |
| GET | `/pages?brand_id={brandId}&ownership=owned&sort=cited&direction=desc&limit=300` | /pages | `pages`, `meta`, `slices`, `hosts`, `computed_at`, `stale` |
| GET | `/pages/config?brand_id={brandId}` | /dashboard | NOT OBSERVED |
| GET | `/pages/funnel?brand_id={brandId}` | /optimize | NOT OBSERVED |
| GET | `/crawler/dashboard?brand_id={brandId}&days=7&granularity=auto` | /dashboard | `has_tracking_id`, `has_historical_data`, `tracking_id`, `summary`, `distribution`, `time_series`, `top_pages`, `recent_activity`, `recent_sessions`, `time_granularity`, `date_range`, `search_bot_visits`, `crawl_efficiency_pct`, `bot_type_summary`, `session_stats`, `compare`, `processing`, `data_basis` |
| GET | `/crawler/submit-to-search/status?brand_id={brandId}&days=1&status=success` | /traffic/crawler | NOT OBSERVED |
| GET | `/crawler/submit-to-search/summary?brand_id={brandId}&days=30` | /traffic/crawler | NOT OBSERVED |
| GET | `/crawler-connect/connections?brand_id={brandId}` | /traffic/crawler | NOT OBSERVED |
| GET | `/crawler-connect/features?brand_id={brandId}` | /traffic/crawler | NOT OBSERVED |
| GET | `/crawler-connect/platforms?brand_id={brandId}` | /traffic/crawler | NOT OBSERVED |
| GET | `/crawler-connect/prism/status?brand_id={brandId}` | /traffic/crawler | NOT OBSERVED |
| GET | `/crawl-profiles/{brandId}` | /optimize | NOT OBSERVED |
| GET | `/prism/status?brand_id={brandId}` | /dashboard | NOT OBSERVED |
| GET | `/diagnose/history?brand_id={brandId}&limit=100` | /dashboard | NOT OBSERVED |
| GET | `/diagnose/placeholders/{brandId}` | /diagnose | NOT OBSERVED |
| GET | `/diagnose/usage?brand_id={brandId}` | /diagnose | NOT OBSERVED |
| GET | `/agent/automations?brand_id={brandId}` | /dashboard | NOT OBSERVED |
| GET | `/agent/needs-you?brand_id={brandId}` | /dashboard | `items`, `count` |
| GET | `/agent/conversations?brand_id={brandId}&include_archived=false&limit=50&offset=0` | /agent | NOT OBSERVED |
| GET | `/agent/memory?brand_id={brandId}` | /agent | NOT OBSERVED |
| GET | `/agent/signals?brand_id={brandId}&limit=10` | /agent | NOT OBSERVED |
| GET | `/agent/visibility?brand_id={brandId}` | /agent | NOT OBSERVED |
| GET | `/automations?brand_id={brandId}` | /automations | NOT OBSERVED |
| GET | `/automations/patterns?brand_id={brandId}` | /automations | NOT OBSERVED |
| GET | `/volume/brand/{brandId}?calculate_missing=false` and `=true` | /dashboard | Array. Item keys: `prompt_id`, `prompt_text`, `search_volume`, `search_demand`, `llm_affinity`, `priority_score`, `source`, `estimated_volume`, `volume_by_platform`, `volume_trend`, `confidence`, `query_type`, `aio_exposure`, `is_stale` |
| GET | `/snapshots/credits/{brandId}` | /research | NOT OBSERVED |
| GET | `/explore/{brandId}/series?days=30` | /explore | NOT OBSERVED |
| GET | `/notifications?user_id={id}&brand_id={brandId}&limit=100` | /activity | NOT OBSERVED |
| GET | `/ga/status?brand_id={brandId}&user_id={id}` | /dashboard | NOT OBSERVED |
| GET | `/gsc/status?brand_id={brandId}` | /prompts | NOT OBSERVED |
| GET | `/gmail/status` | /integrate | NOT OBSERVED |
| GET | `/integrations/openai-ads?brand_id={brandId}` | /prompts | NOT OBSERVED |
| GET | `/work-item-integrations/accounts?brand_id={brandId}` | /integrate | NOT OBSERVED |
| GET | `/workflow-integrations/?user_id={id}` | /integrate | NOT OBSERVED |
| GET | `/sites/?brand_id={brandId}` | /traffic/crawler | NOT OBSERVED |
| GET | `/sites/platforms` | /optimize | NOT OBSERVED |
| GET | `/sites/connection-statuses?brand_id={brandId}` | /integrate | NOT OBSERVED |
| GET | `/sites/agent-status?brand_id={brandId}` | /agent | NOT OBSERVED |
| GET | `/optimise/brands/{brandId}/destinations` | /optimize | NOT OBSERVED |
| GET | `/optimise/brands/{brandId}/proposal-summary` | /optimize | NOT OBSERVED |
| GET | `/api/site-optimization/audit/{id}?brand_id={brandId}` | /optimize | NOT OBSERVED |
| GET | `/api/site-optimization/synthesis/{id}?brand_id={brandId}` | /optimize | NOT OBSERVED |
| GET | `/api/site-optimization/prompt-coverage/{id}?brand_id={brandId}` | /optimize | NOT OBSERVED |
| GET | `/api/site-optimization/crawler-state?brand_id={brandId}&site_url=<url>` | /optimize | NOT OBSERVED |
| GET | `/api/site-optimization/delivery-health/{id}?brand_id={brandId}` | /automations | NOT OBSERVED |
| GET | `/create/agent/runs?brand_id={brandId}&limit=1` | /create | NOT OBSERVED |
| GET | `/create/agent/settings?brand_id={brandId}` | /create | NOT OBSERVED |
| GET | `/create/campaigns?brand_id={brandId}` | /create | NOT OBSERVED |
| GET | `/create/opportunities?brand_id={brandId}&state=gap&group_by=campaign&sort=priority&sort_dir=desc&limit=50` | /create | NOT OBSERVED |
| GET | `/double/run/{brandId}` | /dashboard | Returns 404 for this account. Body key: `detail` |
| GET | `/internal/platform-stats` | /dashboard | NOT OBSERVED |
| POST | `/analytics/identify` | /dashboard | NOT OBSERVED |
| POST | `/api/activation/track` | /dashboard | NOT OBSERVED |

Pages that produced no new API call during the sweep: `/perception` and `/reports`. Both reuse data already fetched on `/dashboard`.

`GET /brands` returns 404. The brand list is served by `/brand-groups` and by Supabase PostgREST (`/rest/v1/brands`).

### 3.3 Complete endpoint inventory from the bundle

The following paths appear as request literals across the entry bundle and all 158 lazy chunks. They are grouped by resource. Methods are given where the client code states them. Where the method is not stated in a literal, the entry is marked `?`. `{p}` marks an interpolated value.

#### Actions and work queue

| Method | Path |
|---|---|
| ? | `/actions`, `/actions/briefing`, `/actions/bulk-status`, `/actions/chart-markers`, `/actions/export`, `/actions/plan`, `/actions/plan/add`, `/actions/plan/swap`, `/actions/plan/swap-candidates`, `/actions/portfolio`, `/actions/portfolio-stats`, `/actions/preferences`, `/actions/projections`, `/actions/refresh`, `/actions/reorder`, `/actions/stats`, `/actions/types` |
| ? | `/actions/feedback-profile`, `/actions/feedback-profile/reset`, `/actions/feedback-profile/reset/{p}/undo` |
| ? | `/actions/generate-llms-txt` |
| ? | `/actions/cms/activity`, `/actions/cms/rollback/{p}`, `/actions/{p}/cms/execute` |
| ? | `/actions/{p}`, `/actions/{p}/assign`, `/actions/{p}/complete`, `/actions/{p}/dismiss`, `/actions/{p}/impact`, `/actions/{p}/notes`, `/actions/{p}/pin`, `/actions/{p}/unpin`, `/actions/{p}/reopen`, `/actions/{p}/retry-result`, `/actions/{p}/share`, `/actions/{p}/snooze`, `/actions/{p}/unsnooze`, `/actions/{p}/start`, `/actions/{p}/timeline` |
| ? | `/actions/{p}/draft`, `/actions/{p}/draft/feedback`, `/actions/{p}/draft/refine`, `/actions/{p}/draft/regenerate`, `/actions/{p}/draft/save` |
| ? | `/actions/{p}/setup-checklist/{p}/skip`, `/actions/{p}/setup-checklist/{p}/unskip` |
| ? | `/actions/{p}/wordpress/apply-fix`, `/actions/{p}/wordpress/publish-draft` |
| ? | `/opportunity-pool`, `/opportunity-pool/{p}/commit`, `/opportunity-pool/{p}/dismiss`, `/opportunity-pool/{p}/plan`, `/opportunity-pool/{p}/restore`, `/opportunity-pool/{p}/seen`, `/opportunity-pool/{p}/snooze` |
| ? | `/ledger/{p}`, `/ledger/{p}/approve`, `/ledger/{p}/comments`, `/ledger/{p}/decline`, `/ledger/{p}/revert`, `/ledger/{p}/ship`, `/ledger/{p}/snooze` |
| ? | `/proof/feed`, `/proof/quarter`, `/correctives`, `/correctives/{p}`, `/outcomes` |

#### Brands, prompts, topics, personas

| Method | Path |
|---|---|
| ? | `/brands`, `/brands/{p}`, `/brands/analyze-domain`, `/brands/bulk-create`, `/brands/bulk-delete`, `/brands/bulk-toggle-tracking`, `/brands/onboard`, `/brands/onboard/preflight`, `/brands/{p}/duplicate` |
| GET | `/brands/{p}/first-report-status` |
| POST | `/brands/{p}/retry-first-report` |
| ? | `/brands/{p}/aliases`, `/brands/{p}/aliases/detect` |
| ? | `/brands/{p}/markets`, `/brands/{p}/markets/{p}`, `/brands/{p}/markets/{p}/set-primary`, `/dashboard/markets-overview` |
| ? | `/brands/{p}/personas`, `/brands/personas/{p}`, `/brands/{p}/personas/generate`, `/brands/{p}/personas/track-prompts`, `/brands/{p}/personas/ask-gap`, `/brands/{p}/personas/ask-gap/recent`, `/brands/{p}/personas/{p}/intelligence`, `/brands/{p}/personas/{p}/profile` |
| ? | `/brands/{p}/audiences/discover`, `/brands/{p}/audiences/discover/{p}/adopt`, `/brands/{p}/audiences/discover/{p}/dismiss` |
| ? | `/brands/{p}/topics`, `/brands/topics/{p}`, `/brands/topics/{p}/merge`, `/brands/{p}/topics/assign`, `/brands/{p}/topics/classify`, `/brands/{p}/topics/rollup`, `/brands/{p}/topics/draft/generate`, `/brands/{p}/topics/draft/apply` |
| ? | `/brands/prompts/{p}/persona`, `/brands/prompts/{p}/topic` |
| ? | `/brands/{p}/sample-paths`, `/brands/{p}/trigger-sentiment` |
| ? | `/prompts`, `/prompts/variant-analysis`, `/prompts/{p}/variant-analysis`, `/prompts/{p}/gsc`, `/prompts/{p}/health`, `/prompts/{p}/health/recompute`, `/prompts/{p}/overtakes` |
| ? | `/prompt-report/rerun`, `/prompt-report/rerun-status/{p}` |
| ? | `/tags/suggest`, `/tags/apply-suggestions`, `/tags/dismiss-suggestions/{p}`, `/tags/suggestions-dismissed/{p}` |
| ? | `/suggestions/brand/{p}`, `/suggestions/generate`, `/suggestions/variants`, `/suggestions/warm/{p}`, `/suggestions/keyword/{p}/{p}`, `/suggestions/tag/{p}/{p}` |
| POST | `/api/prompts/suggest`, `/api/prompts/analyze-url` |
| ? | `/volume/brand/{p}`, `/volume/prompt/{p}`, `/volume/calculate`, `/volume/refresh/{p}` |
| ? | `/api/prompt-research/{p}` |

#### Citations, competitors, rankings, perception

| Method | Path |
|---|---|
| ? | `/citations/{p}`, `/citations/{p}/all`, `/citations/{p}/citation`, `/citations/{p}/feed`, `/citations/{p}/heatmap`, `/citations/{p}/history`, `/citations/{p}/queries`, `/citations/{p}/source/{p}`, `/citations/{p}/bust-cache` |
| ? | `/citations/{p}/gsc`, `/citations/{p}/gsc/actions`, `/citations/{p}/gsc/actions/preview` |
| ? | `/citations/{p}/videos`, `/citations/{p}/videos/{p}`, `/citations/{p}/video-channels`, `/citations/{p}/video-channels/{p}` |
| GET | `/citations/teaser/{p}` |
| ? | `/api/citations/{p}` |
| ? | `/outreach/{p}/opportunities`, `/outreach/{p}/opportunities/export`, `/outreach/{p}/opportunities/bulk-status`, `/outreach/{p}/opportunities/{p}`, `/outreach/{p}/opportunities/{p}/notes`, `/outreach/{p}/opportunities/{p}/notes/{p}` |
| ? | `/competitors/{p}`, `/competitors/{p}/all`, `/competitors/{p}/arena`, `/competitors/{p}/by-llm`, `/competitors/{p}/head-to-head`, `/competitors/{p}/hidden`, `/competitors/{p}/hide`, `/competitors/{p}/unhide`, `/competitors/{p}/prompt-detail`, `/competitors/{p}/threats`, `/competitors/{p}/clear-cache` |
| ? | `/competitors/{p}/debug/visibility`, `/competitors/{p}/debug/competitor-visibility`, `/competitors/{p}/debug/reports-visibility` |
| ? | `/competitor-groups/{p}`, `/competitor-groups/{p}/{p}`, `/competitor-groups/{p}/detect`, `/competitor-groups/{p}/accept/{p}`, `/competitor-groups/{p}/accept-all`, `/competitor-groups/{p}/dismiss-all`, `/competitor-groups/{p}/store-suggestions` |
| ? | `/rankings/{p}/competitor-trend`, `/rankings/prompt-markets/{p}` |
| ? | `/api/perception/dashboard`, `/api/perception/story`, `/api/perception/run`, `/api/perception/backfill` |
| ? | `/api/narratives` |

#### Pages, optimize, sites, publishing

| Method | Path |
|---|---|
| ? | `/pages`, `/pages/config`, `/pages/funnel`, `/pages/measure`, `/pages/add-and-measure`, `/pages/materialize-audit`, `/pages/record`, `/pages/resolve`, `/pages/track`, `/pages/measurement-jobs/{p}`, `/pages/{p}/measure`, `/pages/{p}/measurement` |
| ? | `/api/analyze-page-deep`, `/api/page-analyses/recent`, `/api/page-analysis/bulk-analyze`, `/api/page-analysis/bulk-analyze/{p}`, `/api/page-analysis/manual-pages` |
| ? | `/api/site-optimization/audit/{p}`, `/api/site-optimization/crawler-state`, `/api/site-optimization/guidance`, `/api/site-optimization/prompt-coverage/{p}`, `/api/site-optimization/render-view`, `/api/site-optimization/synthesis/{p}` |
| ? | `/audit-issues`, `/audit-pages` |
| GET | `/sites/?{p}`, `/sites/{p}`, `/sites/platforms`, `/sites/history?{p}`, `/sites/health/all?{p}`, `/sites/{p}/health`, `/sites/{p}/stats`, `/sites/{p}/content?{p}`, `/sites/agent-status?{p}`, `/sites/analytics/fixes?{p}` |
| POST | `/sites/connect`, `/sites/{p}/health/check`, `/sites/{p}/verify?include_capabilities=false` |
| DELETE | `/sites/{p}` |
| GET | `/sites/proposals?{p}`, `/sites/proposals/{p}`, `/sites/proposals/{p}/logs` |
| POST | `/sites/proposals/{p}/approve`, `/sites/proposals/approve-bulk`, `/sites/proposals/{p}/dismiss`, `/sites/proposals/{p}/rollback` |
| GET/PUT | `/sites/{p}/field-mappings` |
| POST | `/sites/{p}/suggest-mappings`, `/sites/{p}/auto-configure-mappings` |
| GET/PUT | `/sites/{p}/github/route-mappings` |
| POST | `/sites/github/init-auth`, `/sites/github/repositories`, `/sites/{p}/github/rescan` |
| GET | `/sites/github/auth-status?{p}` |
| POST | `/sites/wordpress/init-auth`, `/sites/wordpress/callback` |
| GET/PATCH | `/sites/{p}/publishing/settings` |
| GET | `/sites/{p}/publishing/options`, `/sites/publishing/links?{p}` |
| POST | `/sites/{p}/publishing/export`, `/sites/{p}/publishing/link`, `/sites/{p}/publishing/sync` |

#### Crawler and crawler-connect

| Method | Path |
|---|---|
| ? | `/crawler/dashboard`, `/crawler/events`, `/crawler/insights`, `/crawler/intelligence`, `/crawler/intelligence/page`, `/crawler/intelligence/page/promote`, `/crawler/live-citations`, `/crawler/metadata`, `/crawler/page-profile`, `/crawler/recent`, `/crawler/reset`, `/crawler/snippet`, `/crawler/spike-detection`, `/crawler/status`, `/crawler/xray`, `/crawler/citation-correlation`, `/crawler/verification-ping`, `/crawler/share/email`, `/crawler/export/{p}.csv` |
| ? | `/crawler/access`, `/crawler/access/apply-fix`, `/crawler/access/dismiss`, `/crawler/access/preview-fix`, `/crawler/access/refresh` |
| ? | `/crawler/submit-to-search`, `/crawler/submit-to-search/status`, `/crawler/submit-to-search/summary` |
| ? | `/crawler-connect/platforms`, `/crawler-connect/features`, `/crawler-connect/connections`, `/crawler-connect/connections/{p}`, `/crawler-connect/connections/{p}/logs`, `/crawler-connect/connections/{p}/manual-credentials`, `/crawler-connect/connections/{p}/sync`, `/crawler-connect/connections/{p}/verify` |
| ? | `/crawler-connect/cloudflare/connect`, `/crawler-connect/cloudflare/zones` |
| ? | `/crawler-connect/vercel/init`, `/crawler-connect/vercel/callback`, `/crawler-connect/vercel/select-project` |
| ? | `/crawler-connect/netlify/init`, `/crawler-connect/netlify/callback`, `/crawler-connect/netlify/select-site` |
| ? | `/crawler-connect/wordpress/connect`, `/crawler-connect/wordpress/plugin` |
| ? | `/crawler-connect/manual/connect`, `/crawler-connect/ingest/manual`, `/crawler-connect/ingest/manual/validate` |
| ? | `/crawler-connect/prism/status`, `/crawler-connect/prism/auto-connect` |
| ? | `/crawl-profiles/{p}` |

#### AI Pages (Prism)

| Method | Path |
|---|---|
| ? | `/prism/status`, `/prism/config`, `/prism/dashboard`, `/prism/setup`, `/prism/analytics`, `/prism/usage`, `/prism/test`, `/prism/test-connection`, `/prism/disable`, `/prism/regenerate-key` |

#### Diagnose

| Method | Path |
|---|---|
| GET | `/diagnose/{p}`, `/diagnose/{p}/diff`, `/diagnose/{p}/outcomes`, `/diagnose/timeline?{p}`, `/diagnose/usage?brand_id={p}`, `/diagnose/placeholders/{p}` |
| POST | `/diagnose/run`, `/diagnose/{p}/implement`, `/diagnose/{p}/rerun`, `/diagnose/{p}/track` |
| DELETE | `/diagnose/clear?brand_id={p}&confirm={p}` |

#### Content, articles, knowledge

| Method | Path |
|---|---|
| ? | `/content`, `/content-ideas`, `/content-ideas/history`, `/content-ideas/refresh`, `/content-ideas/status`, `/content-ideas/record-implementation`, `/content-ideas/dismiss-by-query`, `/content-ideas/{p}/dismiss` |
| ? | `/articles/templates/generate-example`, `/articles/templates/generate-guidelines` |
| ? | `/api/briefs/create`, `/api/briefs/list`, `/api/briefs/preview`, `/api/briefs/{p}`, `/api/briefs/{p}/resend`, `/api/briefs/{p}/download-capability`, `/api/briefs/public/{p}`, `/api/briefs/public/{p}/verify`, `/api/briefs/public/{p}/track-view` |
| ? | `/api/circulation-templates`, `/api/circulation-templates/{p}` |

#### Reports and export

| Method | Path |
|---|---|
| ? | `/api/reports/generate`, `/api/reports/{p}`, `/api/reports/{p}/regenerate`, `/api/reports/detail/{p}`, `/api/reports/detail/{p}/download-capability` |
| ? | `/reports/compare`, `/reports/{p}/results` |
| ? | `/exports/csv`, `/exports/history`, `/exports/options`, `/exports/preview` |
| ? | `/api/export/csv/{p}`, `/api/export/sheets/{p}` |
| ? | `/api/dashboard/{p}`, `/api/dashboard2/{p}`, `/api/historical/{p}` |

#### Workflows and automations

| Method | Path |
|---|---|
| ? | `/workflows/`, `/workflows/{p}`, `/workflows/{p}/duplicate`, `/workflows/{p}/pause`, `/workflows/{p}/resume`, `/workflows/{p}/runs`, `/workflows/{p}/test`, `/workflows/generate`, `/workflows/backtest`, `/workflows/runs/by-brand`, `/workflows/runs/{p}/logs`, `/workflows/runs/{p}/retry-delivery`, `/workflows/templates/`, `/workflows/templates/{p}/use`, `/workflows/admin/all`, `/workflows/admin/runs/{p}` |
| ? | `/workflow-integrations/`, `/workflow-integrations/{p}`, `/workflow-integrations/{p}/logs`, `/workflow-integrations/{p}/test` |
| ? | `/automations`, `/automations/compose`, `/automations/patterns`, `/automations/rehearse`, `/automations/scope-preview`, `/automations/agent/{p}/record`, `/automations/agent/{p}/runs/{p}/retry-delivery` |
| ? | `/agent`, `/agent/automations`, `/agent/automations/{p}`, `/agent/automations/{p}/status`, `/agent/needs-you`, `/agent/needs-you/nudge`, `/agent/needs-you/{p}/resolve`, `/agent/messages/{p}/suggestions/{p}/{p}`, `/agent/messages/{p}/suggestions/{p}/{p}/stream` |
| ? | `/copilot/media`, `/copilot/v2/messages/{p}/suggestions/{p}/{p}`, `/copilot/v2/messages/{p}/suggestions/{p}/{p}/stream` |

#### Analytics connections

| Method | Path |
|---|---|
| ? | `/ga/status`, `/ga/auth-url`, `/ga/callback`, `/ga/connect`, `/ga/disconnect`, `/ga/accounts`, `/ga/properties`, `/ga/report`, `/ga/funnel-report`, `/ga/funnel-steps`, `/ga/pinned-events`, `/ga/recent-ai-visitors`, `/ga/use-saved-credentials`, `/ga/conversion-values`, `/ga/conversion-values/{p}` |
| ? | `/gsc/status`, `/gsc/auth-url`, `/gsc/callback`, `/gsc/connect-site`, `/gsc/disconnect`, `/gsc/sites`, `/gsc/page-summary` |
| ? | `/integrations/openai-ads`, `/integrations/openai-ads/blueprint`, `/integrations/openai-ads/connect`, `/integrations/openai-ads/test` |

#### Subscription and billing

| Method | Path |
|---|---|
| POST | `/subscription/checkout` |
| ? | `/subscription/effective`, `/subscription/details`, `/subscription/sync`, `/subscription/invoices`, `/subscription/payment-portal`, `/subscription/payment-recovery`, `/subscription/receipt-email-preference`, `/subscription/reconcile-billing-email` |
| ? | `/subscription/upgrade`, `/subscription/downgrade`, `/subscription/downgrade-changes`, `/subscription/downgrade-changes/acknowledge`, `/subscription/preview-change`, `/subscription/preview-cycle-switch`, `/subscription/switch-cycle`, `/subscription/upgrade-recap`, `/subscription/upgrade-recap/compute-gap` |
| ? | `/subscription/cancel`, `/subscription/cancel-undo`, `/subscription/cancellation-stats`, `/subscription/pause`, `/subscription/pause-status`, `/subscription/resume` |
| ? | `/subscription/trial-eligibility`, `/subscription/trial-save-offer`, `/subscription/end-trial`, `/subscription/start-scale-trial`, `/subscription/scale-trial-status` |
| ? | `/subscription/extra-brands`, `/subscription/extra-markets`, `/subscription/extra-prompts`, `/subscription/preview-markets-change`, `/subscription/preview-prompts-change` |
| ? | `/subscription/article-bulk`, `/subscription/article-credits`, `/subscription/article-credits/debug-add`, `/subscription/article-pack`, `/subscription/article-topup`, `/subscription/article-topup/verify`, `/subscription/preview-article-pack-change` |
| ? | `/subscription/prism-addon`, `/subscription/preview-prism-addon` |
| ? | `/subscription/white-label-brands`, `/subscription/white-label/brands`, `/subscription/white-label/preview`, `/subscription/white-label/toggle-brand/{p}` |
| ? | `/discount/queue` |

#### Referral programme

| Method | Path |
|---|---|
| ? | `/referral/info`, `/referral/code`, `/referral/code/toggle-active`, `/referral/generate-code`, `/referral/check-code`, `/referral/track-click`, `/referral/process-signup` |
| ? | `/referral/payout/balance`, `/referral/payout/history`, `/referral/payout/request`, `/referral/payout/settings`, `/referral/payout/verify-email` |
| ? | `/referral/admin/analytics`, `/referral/admin/list`, `/referral/admin/summary`, `/referral/admin/override/{p}`, `/referral/admin/payouts`, `/referral/admin/payouts/{p}/process` |

#### Users, teams, groups, auth

| Method | Path |
|---|---|
| GET | `/users/admin-access`, `/users/team-directory`, `/users/me/api-key`, `/users/me/mcp-token`, `/users/me/mcp-token/sessions` |
| POST | `/users/me/api-key`, `/users/me/mcp-token`, `/users/me/mcp-token/reveal`, `/users/me/mcp/device-approve`, `/users/me/leave-team` |
| DELETE | `/users/me`, `/users/me/mcp-token/sessions/{p}` |
| ? | `/users/migrate-bubble-user` |
| GET | `/brand-groups`, `/brand-groups/{p}/clients` |
| POST | `/brand-groups`, `/brand-groups/suggest`, `/brand-groups/{p}/brands`, `/brand-groups/{p}/clients`, `/brand-groups/{p}/clients/{p}/resend` |
| PATCH | `/brand-groups/{p}`, `/brand-groups/{p}/clients/{p}` |
| DELETE | `/brand-groups/{p}`, `/brand-groups/{p}/brands/{p}`, `/brand-groups/{p}/clients/{p}` |
| ? | `/auth/session`, `/auth/sessions`, `/auth/magic-link`, `/auth/set-password`, `/auth/send-reset-email`, `/auth/impersonation/verify`, `/auth/admin/impersonate` |
| ? | `/api/invites/team`, `/api/invites/team/reminder`, `/api/invites/contact` |
| ? | `/signup/sync-contact` |
| ? | `/domains/resolve`, `/whitelabel/domain/verify` |

#### Client portal

| Method | Path |
|---|---|
| GET | `/client/brands`, `/client/brands/{p}`, `/client/group-brands`, `/client/portal-settings?team_id={p}`, `/client/onboarding/status`, `/client/activity?limit={p}`, `/client/exports`, `/client/exports/{p}` |
| POST | `/client/activity`, `/client/exports`, `/client/onboarding/complete`, `/client/onboarding/methodology-seen`, `/client/onboarding/welcome-seen` |
| ? | `/clients`, `/clients/{p}`, `/clients/{p}/resend` |

#### Agency

| Method | Path |
|---|---|
| POST | `/agency/generate-grounded-pitch`, `/agency/pitches/{p}/send` |
| ? | `/agency/settings`, `/agency/suggest-competitors`, `/agency-preview/{p}` |
| GET | `/brand-kit/{p}` |

#### Share, teaser, gate

| Method | Path |
|---|---|
| ? | `/share`, `/share/{p}`, `/share/analytics`, `/share/generate-summary`, `/share/verify-password`, `/share/public/{p}`, `/share/public/{p}/content`, `/share/public/{p}/crawler-content`, `/share/public/{p}/capture-lead` |
| ? | `/teaser/{p}`, `/teaser/{p}/refresh`, `/gates/teaser/generate`, `/gates/teaser/generate-all/{p}`, `/gates/teaser/{p}/{p}` |
| ? | `/public/{p}` |

#### Research, lens, snapshots

| Method | Path |
|---|---|
| GET | `/research-insights/{p}`, `/lens/board?{p}` |
| POST | `/research-insights/{p}/generate`, `/research-insights/{p}/regenerate`, `/lens/feedback` |
| ? | `/snapshots`, `/snapshots/run`, `/snapshots/credits/{p}` |

#### Surveys

| Method | Path |
|---|---|
| GET | `/surveys/{p}/prompt-status`, `/surveys/{p}/responses/mine` |
| POST | `/surveys/{p}/responses`, `/surveys/{p}/dismiss` |

#### Platform, admin, telemetry

| Method | Path |
|---|---|
| ? | `/internal/platform-stats`, `/internal/gtm/track-visit` |
| ? | `/admin/pulse`, `/admin/report-health`, `/admin/runs`, `/admin/status`, `/admin/status/publish`, `/admin/status/components/{p}/override`, `/admin/status/incidents`, `/admin/status/incidents/{p}/resolve`, `/admin/status/incidents/{p}/updates`, `/status/public` |
| ? | `/admin/mcp/observability/overview`, `/admin/mcp/observability/events`, `/admin/mcp/observability/insights`, `/admin/mcp/observability/sessions`, `/admin/mcp/observability/sessions/{p}`, `/admin/mcp/observability/tools`, `/admin/mcp/observability/public/overview`, `/admin/mcp/observability/public/events` |
| ? | `/analytics/event`, `/analytics/identify`, `/analytics/error`, `/analytics/ux-signal` |
| ? | `/analytics/admin/stats`, `/analytics/admin/funnel`, `/analytics/admin/errors`, `/analytics/admin/errors/{p}`, `/analytics/admin/ux-signals`, `/analytics/admin/user/{p}/journey` |
| ? | `/errors/groups`, `/errors/groups/{p}/occurrences`, `/errors/groups/{p}/status`, `/errors/stats`, `/errors/calculate-trends` |
| ? | `/activity/brand/{p}`, `/activity/user/{p}`, `/activity/user-by-email/{p}`, `/activity/search`, `/activity/session/{p}`, `/activity/stats`, `/activity/recent-users` |
| ? | `/api/activation/track`, `/tracking/page-viewed` |
| ? | `/health` |

#### Supabase PostgREST (direct)

| Method | Path |
|---|---|
| ? | `/rest/v1/users`, `/rest/v1/brands`, `/rest/v1/brand_members`, `/rest/v1/teams`, `/rest/v1/team_clients` |

### 3.4 Machine-readable discovery files

Listed on `/learn/api`. Exact URLs NOT OBSERVED beyond the labels shown.

| File | Purpose |
|---|---|
| OpenAPI 3.1 contract | Authenticated REST paths, schemas, errors, access requirements. |
| MCP server card | Discovery metadata for public and authenticated MCP surfaces. |
| MCP manifest | Stable machine-readable MCP endpoints and capability metadata. |
| `llms.txt` | Concise map of product, documentation, research, and data pages. |
| `llms-full.txt` | Extended product and public-data reference. |

---

## 4. Documentation tree

### 4.1 Top navigation of `/learn`

| Href | Title |
|---|---|
| `/learn/docs` | Docs |
| `/learn/api` | API |
| `/learn/api/mcp` | MCP |

### 4.2 `/learn/docs` sidebar tree

Reading time is the value printed on each page as "N min read". Description is the page `meta description`.

| Section | Href | Title | Reading time | Description |
|---|---|---|---|---|
| (top) | `/learn/docs/introduction` | Introduction | 2 min read | See how AI talks about your brand, find the pages and work that matter, and measure what changed after the work was done. |
| (top) | `/learn/docs/quick-start` | Quick Start | 6 min read | From zero to your first AI visibility baseline in about ten minutes. |
| (top) | `/learn/docs/concepts` | Core Concepts | 5 min read | The mental model behind Trakkr: vocabulary, the visibility loop, what drives scores. |
| Prompts | `/learn/docs/features/prompts` | Prompts | 12 min read | The questions Trakkr asks AI on your behalf. |
| Prompts | `/learn/docs/features/prompts/tags` | Tags | 4 min read | Short, colour-coded labels you stick on prompts. |
| Prompts | `/learn/docs/features/prompts/audiences` | Audiences | 5 min read | Buyer and customer segments auto-classified from your prompts. |
| Prompts | `/learn/docs/features/diagnose` | Diagnose | 9 min read | Why one AI answer looks the way it does, and what would change it. |
| Prompts | `/learn/docs/features/research` | Research | 9 min read | Sample what AI says about your category. |
| Visibility | `/learn/docs/features/pages` | Pages | 11 min read | Whether AI can reach, read, cite, and send people to each page. |
| Visibility | `/learn/docs/features/citations` | Citations | 11 min read | The sources AI points to as the basis for its answers. |
| Visibility | `/learn/docs/features/citations/outreach` | Outreach | 6 min read | Turn citation gaps into a working queue. |
| Visibility | `/learn/docs/features/competitors` | Competitors | 10 min read | Who shows up alongside your brand when AI answers a buyer question. |
| Visibility | `/learn/docs/features/perception` | Perception | 9 min read | What AI actually says about your brand. |
| Traffic | `/learn/docs/features/traffic` | Overview | 2 min read | How crawler reads and human arrivals fit into the page journey. |
| Traffic | `/learn/docs/features/traffic/visitors` | Visitors | 6 min read | AI referral sessions in connected Google Analytics. |
| Traffic | `/learn/docs/features/traffic/crawlers` | Crawlers | 9 min read | The AI bots reading your site. |
| Traffic | `/learn/docs/features/traffic/crawlers/install` | Install | 16 min read | Install crawler tracking on Cloudflare, Vercel, Netlify, WordPress, and more. |
| Growth | `/learn/docs/features/content` | Create Content | 9 min read | Content infrastructure built for AI consumption. |
| Growth | `/learn/docs/features/content/ideas` | Content Ideas | 7 min read | How to discover content opportunities. |
| Growth | `/learn/docs/features/content/knowledge` | Knowledge Base | 8 min read | Why generic content fails and how to build assets worth citing. |
| Growth | `/learn/docs/features/content/templates` | Templates | 7 min read | Why content structure matters for AI. |
| Growth | `/learn/docs/features/content/style` | Writing Style | 6 min read | How to ensure generated content sounds like your brand. |
| Growth | `/learn/docs/features/content/articles` | Articles | 10 min read | Generating, editing, and publishing AI-optimised articles. |
| Growth | `/learn/docs/features/optimize` | Optimize Site | 10 min read | Scan how AI reads your site and work through one evidence-led list. |
| Growth | `/learn/docs/features/ai-pages` | AI Pages | 10 min read | Serve a version of your website built for AI crawlers. |
| Growth | `/learn/docs/features/ai-pages/installation` | Installation | 8 min read | Deploy AI Pages on your hosting platform. Nine integration paths. |
| Growth | `/learn/docs/features/ai-pages/optimizations` | Optimizations | 8 min read | What each enhancement does to the HTML AI crawlers receive. |
| Growth | `/learn/docs/features/reddit` | Reddit | 10 min read | Trakkr tracks the threads shaping what AI says about your brand. |
| Growth | `/learn/docs/features/actions` | Actions | 8 min read | One place to decide what needs you and what to do this week. |
| Growth | `/learn/docs/features/results` | Results | 9 min read | How Trakkr measures shipped work and keeps the bar fixed. |
| Automate | `/learn/docs/features/integrations` | Integrations | 10 min read | How Trakkr connects to the rest of your stack. |
| Automate | `/learn/docs/features/integrations/looker-studio` | Looker Studio | 8 min read | Build reusable BI dashboards with live Trakkr data. |
| Automate | `/learn/docs/features/sites` | Sites | 11 min read | Connect the web properties Trakkr can read from and push fixes to. |
| Automate | `/learn/docs/features/agent` | Agent | 14 min read | An AI consultant that knows your brand's visibility data. |
| Automate | `/learn/api` | API & MCP | NOT OBSERVED | Link out to the API reference. |
| Reference | `/learn/docs/metrics` | Metrics | 19 min read | Every Trakkr score, result rule, journey state, ratio, and chart axis. |
| Reference | `/learn/docs/glossary` | Glossary | 11 min read | Definitions of key terms used throughout Trakkr. |
| Reference | `/learn/docs/faq` | FAQ | 15 min read | Quick answers to the most common questions about Trakkr. |
| Account | `/learn/docs/account` | Account overview | 5 min read | How users, teams, brands, plans, and access fit together. |
| Account | `/learn/docs/account/brands` | Brands | 6 min read | Add, configure, duplicate, pause, and manage brands. |
| Account | `/learn/docs/account/teams` | Teams | 6 min read | Invite teammates, set roles, restrict brand access, delegate billing. |
| Account | `/learn/docs/account/billing` | Plans and billing | 7 min read | Team plan inheritance, limits, add-ons, trials, invoices. |
| Account | `/learn/docs/features/reports-export` | Reports & Export | 7 min read | Send, download, sync, or query Trakkr data. |
| Account | `/learn/docs/account/settings` | Settings | 7 min read | Every account, brand, plan, team, agency, security, and developer control. |
| Account | `/learn/docs/features/agency` | Agency | 6 min read | Run Trakkr for a portfolio of client brands. |
| Account | `/learn/docs/features/agency/pitches` | Pitches | 6 min read | Generate a real AI visibility audit for a prospect brand. |
| Account | `/learn/docs/features/agency/compare` | Compare | 5 min read | Read client brands side by side on Agency home. |
| Account | `/learn/docs/features/agency/actions` | Portfolio Actions | 5 min read | Manage work across every client brand. |
| Account | `/learn/docs/features/agency/portfolio-results` | Portfolio Results | 8 min read | See what work earned across every client. |
| Account | `/learn/docs/features/agency/pdf-export` | Agency Reports | 6 min read | Schedule branded client reports and review held sends. |
| Account | `/learn/docs/account/white-label/overview` | White-Label Portal | 6 min read | Give clients a read-only Trakkr portal under your name. |
| Account | `/learn/docs/features/agency/team` | Team Management | 5 min read | Invite teammates, set roles, scope brand access per member. |

### 4.3 Pages linked from the `/learn/docs` landing but not in the sidebar

These hrefs appear only in the landing-page cards. They may be aliases or unpublished.

| Href | Card title |
|---|---|
| `/learn/docs/features/automations` | Automations |
| `/learn/docs/features/brands` | Brands |
| `/learn/docs/features/reports` | Reports & Export |
| `/learn/docs/features/live-visitors` | Live Visitors |
| `/learn/docs/faq/troubleshooting` | Troubleshooting |
| `/learn/docs/account/white-label/domain-setup` | Domain Setup |
| `/learn/docs/account/white-label/branding` | Branding |

Reading times for the seven rows above: NOT OBSERVED.

Reading times shown on the landing "START HERE" cards: Quick Start 5 min, Core Concepts 8 min, Prompts 12 min, FAQ 6 min. These differ from the per-page values for Quick Start (6 min) and Core Concepts (5 min).

### 4.4 `/learn/api` sidebar and endpoint list

| Group | Href | Title |
|---|---|---|
| Getting started | `/learn/api/introduction` | Introduction |
| Getting started | `/learn/api/authentication` | Authentication |
| Getting started | `/learn/api/rate-limits` | Rate limits |
| Getting started | `/learn/api/errors` | Errors |
| Getting started | `/learn/api/mcp` | MCP server |
| Getting started | `/learn/api/mcp/recipes` | MCP cookbook |
| Core data | `/learn/api/endpoints/brands` | `GET /get-brands` - list your brands |
| Core data | `/learn/api/endpoints/scores` | `GET /get-scores` - visibility metrics |
| Core data | `/learn/api/endpoints/prompts` | `GET /get-prompts` - manage prompts |
| Visibility | `/learn/api/endpoints/citations` | `GET /get-citations` - citation URLs |
| Visibility | `/learn/api/endpoints/rankings` | `GET /get-rankings` - visibility rankings |
| Visibility | `/learn/api/endpoints/models` | `GET /get-models` - AI model breakdown |
| Visibility | `/learn/api/endpoints/competitors` | `GET /get-competitor-data` - competitor analysis |
| Intelligence | `/learn/api/endpoints/opportunities` | `GET /get-opportunities` - citation gaps |
| Intelligence | `/learn/api/endpoints/content-ideas` | `GET /get-content-ideas` - content gap analysis |
| Intelligence | `/learn/api/endpoints/pool-results-pages` | `GET /get-opportunity-pool` - suggestions waiting on a decision |
| Intelligence | `/learn/api/endpoints/pool-results-pages` | `GET /get-results` - what completed work changed |
| Intelligence | `/learn/api/endpoints/pool-results-pages` | `GET /get-pages` - page registry |
| Intelligence | `/learn/api/endpoints/perception` | `GET /get-perception` - perception analysis |
| Intelligence | `/learn/api/endpoints/crawler` | `GET /crawler/overview` - crawler dashboard APIs (Paid) |
| Intelligence | `/learn/api/endpoints/reports` | `GET /get-reports` - AI visibility reports |
| Actions | `/learn/api/endpoints/narratives` | `GET /narratives` - narrative intelligence (Scale) |
| Actions | NOT OBSERVED (no href) | `POST /commit-opportunity` - commit, dismiss or snooze |
| Actions | `/learn/api/endpoints/diagnose` | `POST /diagnose` - query diagnosis |
| Actions | `/learn/api/endpoints/prism` | `GET /ai-pages` - AI Pages |
| Actions | `/learn/api/endpoints/export` | `GET /export` - CSV/JSON export |
| Actions | `/learn/api/endpoints/webhooks` | `POST /webhooks` - event notifications |
| Tools | `/learn/api/playground` | Playground |

Access rules stated on the page: REST API access is included on Scale and Enterprise. The MCP server is available on every paid plan.

Sample request shown on the page:

```
curl -H 'Authorization: Bearer $TRAKKR_API_KEY' \
  'https://api.trakkr.ai/get-brands'
```

### 4.5 `/learn/api/mcp` - MCP server

| Item | Value |
|---|---|
| Authenticated MCP endpoint | `https://api.trakkr.ai/mcp` |
| Public read-only MCP endpoint | `https://api.trakkr.ai/public/mcp` |
| Tool count | 76 tools in 12 groups |
| Package | `trakkr-mcp` |
| Version | 0.17.0 |
| Python requirement | >= 3.10 |
| Licence | MIT |
| Connect token | Generated in Settings > Developer. Prefix `mcp_connect_`. Shown once. |
| Supported clients | Claude App, Claude Code, Cursor, VS Code, Codex, Windsurf, Zed, Cline, Manual. ChatGPT marked SOON. |
| Logging | Tool names, timing, status, short intent hints, bounded redacted input and result previews. Full conversations are not stored. |

#### 4.5.1 Tool list

| Group | Tool | Purpose |
|---|---|---|
| Core (10) | `report_unmet_need` | Record a request no current tool can complete. |
| Core | `list_brands` | List all tracked brands. Returns IDs for other tools. |
| Core | `set_brand_location` | Set a brand primary market. |
| Core | `get_visibility_scores` | Visibility scores and trends over time. |
| Core | `list_prompts` | List tracked search queries for a brand. |
| Core | `list_tags` | List every prompt tag, with prompt counts. |
| Core | `manage_prompt` | Create, update, or delete a tracked prompt. |
| Core | `manage_prompt_tags` | Create, rename, recolour, delete, or apply a tag. |
| Core | `suggest_prompts` | Suggest fresh prompts grounded in the brand profile. |
| Core | `update_brand_aliases` | Update a brand's aliases. |
| Visibility (5) | `get_citations` | Citation URLs, history, queries, sources, feed, heatmap. |
| Visibility | `get_rankings` | Competitive rankings in AI search results. |
| Visibility | `get_model_breakdown` | Visibility by AI model. |
| Visibility | `get_competitors` | Summary, arena, head-to-head, threats. |
| Visibility | `manage_competitor` | Track, untrack, hide, or unhide a competitor. |
| Intelligence (5) | `get_opportunities` | Citation gaps where competitors appear but you do not. |
| Intelligence | `get_content_ideas` | AI-generated content ideas. |
| Intelligence | `get_perception` | Sentiment, themes, narrative shifts, competitor-relative metrics. |
| Intelligence | `get_prism` | AI Pages connection state and monthly usage. |
| Intelligence | `get_narratives` | Tracked topics and storylines. Scale plan. |
| Research (5) | `get_latest_research` | Most recent completed research run. |
| Research | `get_research_runs` | List research runs, newest first. |
| Research | `get_research_run` | Full analytics payload for one run. |
| Research | `get_research_credits` | Topic snapshot credit usage. Scale plan. |
| Research | `run_research_snapshot` | Trigger a 50-prompt topic snapshot. Uses one credit. |
| Audit (7) | `get_actions` | Unified recommendation queue. |
| Audit | `get_action_stats` | Aggregate counts for the action queue. |
| Audit | `list_pages` | Page registry with bottleneck and verdict. |
| Audit | `list_audits` | List site audits, or fetch one by ID. |
| Audit | `get_audit_findings` | Audit issues and flagged pages. |
| Audit | `list_page_analyses` | List recent deep page analyses. |
| Audit | `get_page_analysis` | Cached deep analysis for one URL. |
| Crawler (9) | `get_crawler_overview` | Hero stats, chart, setup state, top pages. |
| Crawler | `get_crawler_live` | Activity feed, top pages, or sessions. |
| Crawler | `get_crawler_pages` | URLs, grouped paths, or normalised bots. |
| Crawler | `get_crawler_detail` | Drawer sections for one page, path, or bot. |
| Crawler | `get_crawler_access` | Findings, bot matrix, robots.txt, llms.txt, submit-to-search. |
| Crawler | `preview_crawler_access_fix` | Preview an Access fix without applying it. |
| Crawler | `send_crawler_verification_ping` | Send the verification ping. |
| Crawler | `submit_crawler_to_search` | Submit crawler pages via IndexNow. |
| Crawler | `get_crawler_submit_status` | Submit-to-search status and summary. |
| Reddit (5) | `get_reddit` | Connection state, mentions, opportunities, threads, subreddits, triggers, analytics. |
| Reddit | `manage_reddit_subreddit` | Add or remove a subreddit. |
| Reddit | `manage_reddit_trigger` | Add or remove a keyword trigger. |
| Reddit | `manage_reddit_opportunity` | Dismiss or mark responded. |
| Reddit | `scan_reddit` | Trigger an on-demand scan. |
| Automations (2) | `get_workflows` | List, single rule, recent runs, run detail, or templates. |
| Automations | `manage_workflow` | Pause, resume, delete, or instantiate from a template. |
| Activity (4) | `get_changes` | Digest of what moved. Returns a `latest_seen` cursor. |
| Activity | `get_notifications` | Read the in-product activity feed. |
| Activity | `mark_notifications_read` | Mark read by ID or clear the unread inbox. |
| Activity | `manage_webhook` | List, inspect, create, delete, or test webhooks. |
| Content (6) | `get_knowledge` | Read the knowledge base sources. |
| Content | `get_articles` | Read brand articles authored in Trakkr. |
| Content | `get_writing_style` | Read the configured voice. |
| Content | `add_knowledge` | Add a source from raw text or a URL. Async. |
| Content | `manage_knowledge` | Delete or reprocess a knowledge source. |
| Content | `generate_article` | Generate an article. Async. Never publishes. |
| Agency (3) | `list_brand_groups` | List agency portfolios with rollup stats. |
| Agency | `compare_brands` | Compare 2-10 brands side by side. |
| Agency | `get_portfolio_actions` | Highest-impact actions across the portfolio. |
| Actions (15) | `manage_action` | complete, dismiss, reopen, start, snooze, unsnooze, pin, unpin, assign, note. |
| Actions | `list_opportunity_pool` | Suggestions waiting on a decision. |
| Actions | `commit_opportunity` | Commit, dismiss, or snooze one suggestion. |
| Actions | `get_results` | What completed work changed. |
| Actions | `get_proof` | Legacy alias for `get_results`. |
| Actions | `run_diagnosis` | Diagnose a query across AI models in real time. |
| Actions | `get_diagnosis_result` | Results, history, or usage quota. |
| Actions | `generate_report` | Generate an AI visibility report. |
| Actions | `get_reports` | List or retrieve generated reports. |
| Actions | `export_data` | Export data as JSON or CSV. |
| Actions | `bulk_manage_prompts` | Create, delete, activate, or deactivate in bulk. |
| Actions | `rerun_prompt` | Trigger a fresh visibility scan for one prompt. |
| Actions | `compare_reports` | Compare visibility between two report periods. |
| Actions | `get_traffic` | Live AI referral traffic status, reports, sessions. |
| Actions | `manage_conversions` | Manage conversion values for AI-referred traffic. |

#### 4.5.2 MCP resources

| URI | Purpose |
|---|---|
| `trakkr://brand` | Index of brands and their IDs, linked to the briefings. |
| `trakkr://brand/{id}/brand-book` | Paste-ready brand context. |
| `trakkr://brand/{id}/snapshot` | Latest AI visibility, by-model table, win/lose prompts. |
| `trakkr://brand/{id}/citation-gaps` | Ranked prompts where AI cites a rival but not you. |
| `trakkr://brand/{id}/prompts` | Tracked questions, active and paused. |
| `trakkr://brands` | Brands you can access, with IDs. |
| `trakkr://brand/{id}/briefing` | Headline visibility and trend, plus open actions. |
| `trakkr://brand/{id}/actions` | Top open actions, most impactful first. |
| `trakkr://brand/{id}/changes` | What moved in the last week. |
| `trakkr://brand/{id}/latest-report` | Most recent generated report. |
| `trakkr://data` | Index of the research briefings. |
| `trakkr://data/what-gets-cited` | Which page types earn AI citations. |
| `trakkr://data/crawler-personalities` | What each AI bot fetches and reads. |
| `trakkr://data/llms-txt-truth` | Null result: llms.txt shows no citation lift. |
| `trakkr://data/schema-advantage` | How structured data correlates with citation. |
| `trakkr://data/citation-decay` | How fast AI citations fade. |
| `trakkr://data/model-divergence` | Where models disagree on who to recommend. |
| `trakkr://data/playbook` | Synthesis of the rules for getting cited. |

#### 4.5.3 MCP workflows (slash commands)

| Command | Arguments | Purpose |
|---|---|---|
| `/weekly-review` | brand, period | Monday brief in five bullets. |
| `/competitor-teardown` | brand, competitor | Where a rival beats you and three moves to close the gap. |
| `/citation-gap-plan` | brand | Losing prompts cross-referenced with the research, then a ranked plan. |
| `/content-brief` | brand, topic | Citation-optimised outline plus on-page schema. |
| `/setup-tracking` | domain | Confirm the brand, set its market, propose starter prompts. |
| `/trakkr-watch` | brand_id, since | Watch playbook. Pass the last cursor to see only new items. |

---

## 5. Auth, callback, invite, and public-share routes

| Route | Class | What it is for |
|---|---|---|
| `/login` | public | Sign in with email and password or magic link. Backed by Supabase auth and `/auth/magic-link`. |
| `/logout` | public | Clears the session and returns to the marketing site. |
| `/start` | public | Signup and first-run entry. Target of `/signup` and `/start-onboarding`. Query `?auth_complete=true` is used after auth. |
| `/signup` | public | Alias for `/start`. |
| `/start-onboarding`, `/start-onboarding/*` | public | Aliases for `/start`. |
| `/reset-password` | public | Password reset form. Backed by `/auth/send-reset-email` and `/auth/set-password`. |
| `/sso/start` | public | Enterprise SSO entry point. |
| `/auth/post-login` | auth-callback | Internal landing after a successful sign-in. The path is a constant in the bundle. Routes the user to onboarding or to the dashboard. |
| `/auth/portal-callback` | auth-callback | Return leg for the client-portal auth flow. |
| `/auth/github/callback` | auth-callback | GitHub OAuth return. Feeds `/sites/github/*`. |
| `/auth/wordpress/callback` | auth-callback | WordPress OAuth return. Feeds `/sites/wordpress/*`. |
| `/auth/work-item/callback` | auth-callback | Issue-tracker OAuth return. Feeds `/work-item-integrations/*`. |
| `/auth/crawler/vercel/callback` | auth-callback | Vercel crawler-connect return. Feeds `/crawler-connect/vercel/*`. |
| `/auth/crawler/netlify/callback` | auth-callback | Netlify crawler-connect return. Feeds `/crawler-connect/netlify/*`. |
| `/oauth/gmail/complete` | auth-callback | Gmail OAuth completion. Feeds `/gmail/status`. |
| `/oauth/consent` | auth-callback | Consent screen shown to third-party API and MCP clients. Paired with `/users/me/mcp/device-approve`. |
| `/invite/:token` | public | Team invite acceptance. Paired with `/api/invites/team`. |
| `/client-invite/:token` | public | Client-portal invite acceptance. Paired with `/brand-groups/{id}/clients`. |
| `/client/login` | public | Client-portal sign in. Separate identity from the main app. |
| `/client/forgot-password` | public | Client-portal reset request. |
| `/client/reset-password` | public | Client-portal reset form. |
| `/pub/:slug` | public-share | Public shared dashboard. Backed by `/share/public/{slug}` and `/share/verify-password`. |
| `/report/:slug` | public-share | Public shared report. |
| `/pitch/:slug` | public-share | Public agency pitch for a prospect brand. |
| `/pitch/:slug/print` | public-share | Print layout of a pitch. |
| `/demo/:slug` | public-share | Public demo. Uses the same component as `/pitch/:slug`. |
| `/survey/:slug` | public-share | Public survey. Backed by `/surveys/{id}/responses`. |
| `/survey/:slug/claim` | public-share | Survey reward claim. |
| `/r/:code` | public-share | Referral link. Backed by `/referral/track-click` and `/referral/process-signup`. |
| `/proposals/woodrow` | public-share | Named public proposal. |
| `/proposals/woodrow/dashboard` | public-share | Dashboard view of that proposal. |
| `/a/:slug`, `/b/:slug`, `/d/:slug` | public-share | Short-form public pages. Exact use NOT OBSERVED. |
| `/audit/:slug` | public-share | Public audit result page. |
| `/certificate/:shareToken` (under `/learn`) | public | Legacy academy certificate. Redirects to `/learn/docs`. |

The client portal has its own error component. Its error states include `domain_not_found` ("This portal address isn't configured"), `page_not_found`, `portal_not_active`, and `session_expired`. Portal branding (logo, colour, name) is loaded before the error screen renders.

---

## 6. Gaps

| Item | Status |
|---|---|
| HTTP method for most bundle-derived endpoints | NOT OBSERVED. Only literals passed to `api.get/post/patch/put/delete` state the method. |
| Response shapes for endpoints not listed in section 3.2 | NOT OBSERVED. |
| `/auth/session` response | NOT OBSERVED. It returns 404 to a plain bearer request. |
| Reading times for the seven landing-only doc pages | NOT OBSERVED. |
| Exact URLs of the OpenAPI, MCP card, MCP manifest, llms.txt, llms-full.txt files | NOT OBSERVED. |
| Purpose of `/a/:slug`, `/b/:slug`, `/d/:slug`, `/qa`, `/marketing` | NOT OBSERVED. |
| Rate-limit values | NOT OBSERVED. The page `/learn/api/rate-limits` was not read. |
