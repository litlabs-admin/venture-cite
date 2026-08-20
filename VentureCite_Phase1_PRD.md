**VentureCite**

Product Requirements Document Phase 1

# **1\. Product Overview**

VentureCite is a SaaS platform that helps brands get discovered and cited by AI-powered search engines (ChatGPT, Perplexity, Gemini, etc.). It automates the foundational tasks of Generative Engine Optimization (GEO) from brand setup and keyword research to AI-optimized content creation and citation tracking.

The initial version was prototyped in Replit. Phase 1 focuses on stabilizing the 5 core features, fixing critical bugs and security vulnerabilities, and delivering a beta-ready product that can be tested with Venture PR as the first client.

# **2\. Phase 1 Goals**

* Stabilize and fully fix the top 5 core features so they work reliably end-to-end.

* Resolve all critical security vulnerabilities before any external beta users are onboarded.

* Redesign the UI/landing page to be polished and client-ready (moving away from the plain Replit scaffold).

* Label remaining features as 'Coming Soon' with estimated release months so the roadmap looks active.

* Set up a shared GitHub repository owned by Ben with controlled API access and rate limits.

# **3\. Phase 1 Core Features Scope**

The following 5 features are the minimum viable set required to onboard beta users and begin monetization. All other features will be marked 'Coming Soon' with a target quarter.

| \# | Feature | Current State | Phase 1 Goal | Priority | Owner |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | **Brand Setup** | Partially working. Auto-pulls info from URL. Manual edit available. | Fix save reliability. Ensure brand data persists and links to the user account correctly. | P0 – Core | Dev Team |
| 2 | **AI Visibility Checklist** | Steps render but ordering is wrong. Not all entries are verified. | Fix step order. Validate all items. Add DeepSeek. Ensure the checklist is actionable. | P0 – Core | Dev Team |
| 3 | **AI Keyword Research** | Fails intermittently. No proper error handling. | Fix API calls \+ error states. Keywords must generate and display reliably every time. | P0 – Core | Dev Team |
| 4 | **AI Content Generation** | Works partially. Auto-improve sometimes lowers score. The article limit hit too fast. | Fix auto-improve logic. Show score delta visually. Set reasonable limits per plan tier. | P0 – Core | Dev Team |
| 5 | **Track AI Citations** | Page not found error. Zero results shown. | Fix routing error. Wire up citation monitoring. Display results clearly on dashboard. | P0 – Core | Dev Team |
| 6 | **Distribute Your Content** | Only shows saved articles with broken “Publish Article” button, doesn’t save the platform specific generated content | Fix broken “Published” button with link to the page, add view, save and edit features to the generated platform specific content. | P0 – Core | Dev Team |

# **4\. Known Bugs to Fix in Phase 1**

| Area | Issue | Severity | Action Required |
| :---- | :---- | :---- | :---- |
| **Auth / Onboarding** | Tutorial starts before user logs in. Sign-up button not prominent. | High | Move tutorial to post-login. Prioritize sign-up CTA. |
| **Pricing Page** | Feature comparison chart flashes and gets covered by duplicate headers. | High | Fix render order. Deduplicate headers. |
| **Dashboard Navigation** | Navbar disappears on Dashboard. Breaks when switching between feature views. | High | Fix navbar persistence across all routes. |
| **Content Generation** | Auto-improve decreases score. Limit hit with no clear message to user. | High | Rework improve logic. Add user-facing limit messaging. |
| **Saved Articles** | Articles show as 'published' but are not accessible. No reference link. | High | Fix publish flow. Store and surface article URLs. |
| **Track AI Citations** | Clicking articles returns 'Page not found'. | Critical | Fix routing. Link citations to correct detail pages. |

# **5\. Security Issues to Resolve Before Beta**

The following security vulnerabilities were identified in the codebase audit. These must be resolved before any external users are onboarded.

| Issue | Description | Fix Required |
| :---- | :---- | :---- |
| **Unrestricted CORS** | app.use(cors()) is a wildcard accepts requests from any domain. | Replace with an explicit allowlist of permitted origins. |
| **Credential Exposure** | .env and .env.\* are missing from .gitignore API keys can be committed accidentally. | Add .env entries to .gitignore immediately. Rotate any keys already committed. |
| **10 CVE Dependencies** | 4 High \+ 6 Moderate vulnerabilities found, including path-to-regexp (DoS risk) and lodash (code injection). | Run pnpm audit \--fix. Update or replace affected packages. |
| **No Payload Size Limit** | express.json() has no size cap server is vulnerable to memory exhaustion. | Add explicit payload size limits (e.g. 1mb). |
| **Stack Traces Exposed** | No global error handler raw stack traces sent to client on unhandled errors. | Add global error middleware. Return sanitized error messages to client. |
| **DB Connection Leaks** | Connection pool has no max/timeout limits. No graceful shutdown on SIGTERM. | Set pool limits. Add shutdown handler. |
| **Post-Merge DB Destructive Script** | scripts/post-merge.sh runs drizzle-kit push automatically — can silently alter or drop columns. | Remove from post-merge hook. Run migrations manually only. |

# **6\. Architecture & Access Decisions**

## **GitHub**

A shared GitHub repository will be created under Ben's account. The dev team will be added as collaborators with appropriate permissions. All commits go through this repo.

## **API Keys**

Ben will provide scoped or rate-limited API keys where possible. Keys must never be committed to the repository. A .env.example file will document required keys without exposing values.

## **Role Levels**

The platform will support three access levels: Super Admin (Ben), Admin (team members / clients with elevated access), and Consumer (end users / beta testers).

