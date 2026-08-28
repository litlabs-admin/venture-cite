# B4-05 prompts extraction report

## Confirmed boundary

The prompt domain starts at `shared/schema.ts` line 131.

The two-line comment belongs to `promptGenerations`.

The moved block ends after `InsertPromptPhrasingTest` at line 359.

The comment at line 361 belongs to `visibilityProgress`.

The legacy `content_drafts` comment at lines 128 to 129 stays in the barrel.

The moved content matches the HEAD source block.

The module adds one final newline at end of file.

## Membership check

`shared/schema.ts` has no prompt-table declaration, Zod builder, or prompt type alias.

`brandPrompts` has two remaining barrel references.

The barrel imports it as a value.

`geoRankings` uses it in its foreign key.

The other seven table names have no remaining barrel reference.

## Import direction

`shared/schema/prompts.ts` imports `brands` from `./brands`.

It does not import `identity`, `content`, or the schema barrel.

`identity.ts`, `brands.ts`, and `content.ts` do not import `prompts.ts`.

The barrel re-exports the prompt module.

## Gates

1. `npm run schema:surface:check` exited with code 0.
   Output: `Export surface unchanged. 260 exports.`
2. Drizzle generated 271 normalized SQL statements from HEAD and from the working tree.
   The sorted statements are identical.
3. `npm run check` exited with code 0.
4. `npm run lint` exited with code 0.
   It reported 0 errors and 840 warnings.
   `npm run format:check` exited with code 0.
   Output: `All matched files use Prettier code style!`
5. `npm test -- --maxWorkers=1` exited with code 0.
   The output included two expected mocked LLM fallback warnings.

## Diff scope

`git diff --stat` reports `shared/schema.ts | 232`, with 2 insertions and 230 deletions.

The untracked new module reports `shared/schema/prompts.ts | 246` as an addition.

No consumer file changed.

No migration changed.
