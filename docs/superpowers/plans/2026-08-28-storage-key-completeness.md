# Storage key completeness implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a source test that rejects storage writes which logout cleanup does not cover.

**Architecture:** The test reads every TypeScript and JavaScript source file under `client/src` and `src`. It uses the TypeScript AST to find direct `localStorage` and `sessionStorage` writes, plus `usePersistedState` calls. It resolves string literals and known constants. It accepts registered keys, the VentureCite prefix, legacy keys, and the retained theme key. It reports unresolved dynamic keys without failing unless the source proves user scope.

**Tech Stack:** Vitest, TypeScript compiler API, Node filesystem APIs, and the existing storage registry.

**Spec:** `.audit/B2B3/prompts/T4-storage-completeness.txt`

## Global constraints

- Scan `client/src` and `src` for `localStorage` and `sessionStorage` writes.
- Cover `setItem` and the `usePersistedState` wrapper.
- Report the file, line, and key for every unaccounted write.
- Report unresolved dynamic keys as `UNRESOLVED`.
- Fail unresolved keys only when the source proves user scope.
- Use the fixed ledger timestamp `2026-08-28T00:00:00+05:30`.
- Run `npx vitest run tests/unit/clientStorageCompleteness.test.ts`.
- Run `npm run check`, `npm run lint`, and `npm run format:check`.

### Task 1: Add the failing source scan test

**Files:**

- Create: `tests/unit/clientStorageCompleteness.test.ts`

- [x] Write a test that walks both source roots and finds direct storage writes.
- [x] Add AST handling for `usePersistedState` calls.
- [x] Resolve string literals and unique constant declarations.
- [x] Accept registry keys, the `venturecite-` prefix, legacy keys, and the theme key.
- [x] Include unresolved findings in diagnostic text with `UNRESOLVED`.
- [x] Run `npx vitest run tests/unit/clientStorageCompleteness.test.ts`.
- [x] Confirm the test fails only after adding an unregistered source write.

### Task 2: Prove the guard catches a real defect

**Files:**

- Modify: one real page under `client/src/pages/` for the temporary write.
- Modify: `tests/unit/clientStorageCompleteness.test.ts` if diagnostics need adjustment.

- [x] Add `localStorage.setItem("vc_temporary_unregistered_key", "test")` to a real page.
- [x] Run the focused test and record the file, line, and key from the failure.
- [x] Remove the temporary write.
- [x] Run the focused test again and record the passing result.

### Task 3: Record decisions and run repository checks

**Files:**

- Modify: `.audit/B2B3/ledger.tsv`

- [x] Append one fixed-timestamp row for each storage-scan decision.
- [x] Run `npm run check`.
- [x] Run `npm run lint`.
- [x] Run `npm run format:check`.
- [x] Inspect the final diff and confirm that the temporary write is absent.
