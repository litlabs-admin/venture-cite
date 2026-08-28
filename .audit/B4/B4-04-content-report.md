# B4-04 content extraction report

## Confirmed boundary

The moved block began at the `articles` comment on HEAD line 77.
The moved block ended on HEAD line 313 after `InsertContentGenerationJob`.
The `llmJobs` comment and table stayed in `shared/schema.ts`.

## Membership check

`shared/schema.ts` has no moved table, builder, or type declaration.
The barrel has one `articles` value import for remaining foreign keys.
The barrel has four remaining `articles.id` foreign key callbacks.
All five tables and all companion exports are in `shared/schema/content.ts`.

## Import direction

`content.ts` imports `brands` from `brands.ts`.
`content.ts` imports `users` from `identity.ts`.
Neither module imports `content.ts`.
The barrel re-exports `content.ts` and imports `articles` as a value.

## Verification

| Gate                           | Result                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `npm run schema:surface:check` | PASS. Export surface unchanged. 260 exports.                                                 |
| Generated SQL comparison       | PASS. 271 statements from HEAD and working schema. The normalized sorted statements matched. |
| `npm run check`                | PASS. TypeScript and 22 tour targets passed.                                                 |
| `npm run lint`                 | PASS. 840 existing warnings. Zero errors.                                                    |
| `npm run format:check`         | PASS. All matched files use Prettier code style.                                             |
| `npm test -- --maxWorkers=1`   | PASS. The command exited with code zero.                                                     |

## Diff and consumers

`git diff --stat` reports `shared/schema.ts | 228`.
It reports two insertions and 226 deletions.
Git does not include untracked `content.ts` in that command.
No consumer file changed.
