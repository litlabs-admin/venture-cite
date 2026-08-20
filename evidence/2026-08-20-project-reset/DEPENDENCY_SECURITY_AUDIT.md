# Dependency security audit

Audit date: 2026-08-20

Command: `npm audit --json`

The audit found 12 advisories: 7 high, 4 moderate, and 1 low. It found no critical advisory.

## Direct runtime dependencies

| Package       | Installed | Severity | Issue                                                            | Safe path                                                                                                                           |
| ------------- | --------: | -------: | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `shepherd.js` |    15.2.2 |     High | `deepmerge-ts` can exhaust the stack on recursive object graphs. | Upgrade `shepherd.js` to a release that uses `deepmerge-ts` 8 or later. Verify the tour UI. The registry reports 15.2.3 as current. |

The `shepherd.js` finding affects the browser bundle. Treat it as a release blocker until the tour paths pass.

## Direct development dependencies

| Package       | Installed | Severity | Issue                                                                               | Safe path                                                                                                                                                                                                           |
| ------------- | --------: | -------: | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drizzle-kit` |   0.31.10 | Moderate | Its `@esbuild-kit` loader chain includes a vulnerable `esbuild` development server. | Review the Drizzle Kit release line before changing it. `npm audit` suggests 0.18.1, which is a downgrade and must not be applied automatically. Prefer a supported release that removes the obsolete loader chain. |

This issue affects migration and schema tooling. It does not ship in the application runtime unless the development dependency is bundled.

## Transitive development dependencies

| Package                   |                       Installed | Severity | Parent path                              | Safe path                                                                                                                    |
| ------------------------- | ------------------------------: | -------: | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `undici`                  |                          7.25.0 |     High | `jsdom` -> `undici`                      | Upgrade `jsdom` to a release that uses `undici` 7.29 or later. Keep this in test tooling.                                    |
| `brace-expansion`         |                1.1.14 and 5.0.5 |     High | ESLint and Sentry tooling                | Refresh ESLint and Sentry tooling so all resolved copies are at least 1.1.18 or 5.0.9. Re-run the lockfile audit.            |
| `js-yaml`                 |                           4.1.1 |     High | ESLint and TanStack Start tooling        | Upgrade the parents or override only after compatibility tests. The safe advisory boundary is 4.3.1 or later.                |
| `form-data`               |                           4.0.5 |     High | `supertest` -> `superagent`              | Upgrade `supertest` and its type package, or add a compatible lockfile resolution at 4.0.6 or later. This remains test-only. |
| `nanoid`                  |                          3.3.16 |     High | `postcss` and Vite                       | Refresh `postcss` and related build tooling. The safe advisory boundary is 3.3.18 or later.                                  |
| `@babel/core`             |                          7.29.0 |      Low | Vite, TanStack, and Sentry build tooling | Upgrade the build parents or Babel to a release newer than 7.29.0. This is a local file-read issue in source-map processing. |
| `esbuild`                 | 0.24.2 nested under Drizzle Kit | Moderate | `drizzle-kit` -> `@esbuild-kit`          | Remove the obsolete Drizzle Kit loader chain. Do not use the audit downgrade without a separate compatibility decision.      |
| `@esbuild-kit/core-utils` |                           3.3.2 | Moderate | `drizzle-kit`                            | Same remediation as the Drizzle Kit finding.                                                                                 |
| `@esbuild-kit/esm-loader` |                           2.6.5 | Moderate | `drizzle-kit`                            | Same remediation as the Drizzle Kit finding.                                                                                 |

## Runtime exposure

The audit marks only `shepherd.js` as a direct runtime dependency. The remaining listed packages are development or test paths in the current tree. This classification came from `npm explain` and the package manifest. Recheck after a clean install because the current `node_modules` tree has extraneous and missing packages.

## Install state warning

`npm ls` reported an inconsistent local tree:

- extraneous `@napi-rs/wasm-runtime`, `@tybys/wasm-util`, and `node-gyp-build`;
- missing `@emnapi/core` and `@emnapi/runtime`;
- invalid `lru-cache`.

This audit used the lockfile and registry metadata. It did not repair the local tree. Run a clean, isolated install before accepting upgrade results.

## Recommended order

1. Upgrade and verify `shepherd.js` in a test build.
2. Resolve the Drizzle Kit loader chain without a downgrade.
3. Refresh `jsdom`, ESLint, Sentry, PostCSS, and Supertest test tooling.
4. Run a clean install, `npm audit`, type checks, lint, tests, and the browser tour checks.
5. Do not run `npm audit fix` on the live project.

## Development advisory repair, 2026-08-20

The project now pins the safe patch versions below through `package.json` overrides.

| Package               | Resolved version |
| --------------------- | ---------------: |
| `@babel/core`         |           7.29.6 |
| `brace-expansion` 1.x |           1.1.18 |
| `brace-expansion` 5.x |            5.0.9 |
| `form-data`           |            4.0.6 |
| `js-yaml`             |            4.3.1 |
| `nanoid`              |           3.3.18 |
| `undici`              |           7.29.0 |

`npm ls` confirms each resolved version.

The local npm audit cache reports zero advisories after the repair.
The install command reports four moderate findings.
They come from `drizzle-kit` 0.31.10 and its `@esbuild-kit` loader chain.

The registry reports 0.31.10 as the current Drizzle Kit release.
The package requires `@esbuild-kit/esm-loader` 2.6.5.
Forcing a newer `esbuild` breaks that loader's declared compatibility range.
The project leaves this development-only advisory open until Drizzle removes the obsolete loader.

Verification passed:

- `npm run check`
- `npm run lint -- --quiet`
- 30 focused Vitest tests
- Drizzle config import with a dummy local test database URL
