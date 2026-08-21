# Dependency security audit

Audit date: 2026-08-22

## Current result

The current registry audit reports four moderate advisories.

It reports no high or critical advisories.

All four advisories belong to the development-only Drizzle Kit loader chain:

- drizzle-kit
- @esbuild-kit/esm-loader
- @esbuild-kit/core-utils
- nested esbuild

The vulnerable esbuild path serves the development server. It does not ship in the production bundle.

The direct runtime dependency shepherd.js resolves to version 15.2.3. The current audit reports no advisory for it.

## Local install state

npm ls reports brace-expansion@5.0.9 as invalid under the minimatch override.

The lockfile resolves the required safe versions. This error belongs to the current node_modules tree.

npm ci --dry-run --ignore-scripts --no-audit did not complete in the local environment. A clean install remains a release preparation task.

Do not run npm audit fix on the live project.

## Current verification

These checks pass on the current branch:

- npm run check
- npm run lint -- --quiet
- npm run format:check
- npm test -- --maxWorkers=1
- npm run supabase:migrations:check
- npm run build

The full test run passed 1,551 tests. It skipped 89 database-dependent tests because Docker is stopped.

## Remediation

Keep the Drizzle Kit advisory open until its loader chain removes the obsolete @esbuild-kit packages.

Do not downgrade esbuild to satisfy the advisory.

Refresh Drizzle Kit and run a clean install when a supported release removes that loader chain.

Re-run npm audit, npm ls, the full test suite, and the production build after that change.

This audit does not authorize a production dependency change.
