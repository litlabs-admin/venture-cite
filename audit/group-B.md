# Group B — Data Flows Integrity Report

## Summary of Critical Findings

### CRITICAL (4 findings):
1. Unbounded analytics query loads all articles in-memory (D6:99-131)
2. Non-transactional mutations in promptSuggestionToTracked (D7:384-396)
3. Revenue code parses as JavaScript Number, loses precision >2^53 (D10:3205-3240)
4. Cascade delete orphans audit trail and billing records (D7:0003_fk_hardening.sql)

### HIGH (15 findings):
- No GDPR export/delete API (D5)
- Weak input validation on content endpoints (D5:1025-1060)
- Incomplete UGC markdown sanitization (D5:SafeMarkdown.tsx)
- Multiple unscoped SELECT queries (D6:74,157,203)
- No geo-rankings pagination (D6)
- N+1 LLM calls in citation judging (D6)
- Job polling inefficiency (D6:23)
- No optimistic locking on concurrent edits (D7)
- Soft vs hard delete inconsistency (D7)
- No state machine guards on status transitions (D7)
- Race condition in job claiming (D7:495-513)
- Boolean fields need tri-state (D8)
- JSON columns lack schema documentation (D8)
- No data retention policy (D9)
- Content drafts unbounded growth (D9)

### MEDIUM (8 findings):
- Password reset unrate-limited (D5)
- Buffer token plaintext storage (D5)
- No duplicate submission guards (D5)
- Redundant data transformations (D6)
- No TOCTOU protection on usage limits (D7)
- Enum values drift from code (D8)
- Field naming inconsistency (D8)
- Citation runs never aggregated (D9)
- Zero-decimal currencies ignored (D10)
- NaN/Infinity unguarded (D10)
- Percentages unbounded (D10)

## Positive Observations
- SafeMarkdown + rehype-sanitize excellent
- Comprehensive ownership scoping in ownership.ts
- Webhook idempotency table (0002)
- FK constraints hardened (0003)
- Rate limiting on AI endpoints
- Revenue schema correct (bug in app layer)

## Remediation Priority
1. Fix unbounded queries (D6) — production stability
2. Implement transactions (D7)
3. Add GDPR deletion (D5) — legal
4. Fix revenue calculations (D10)
5. Define retention policies (D9)

