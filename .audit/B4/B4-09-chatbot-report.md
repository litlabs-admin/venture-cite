# B4-09 chatbot schema extraction report

## Boundary

The boundary starts at `chatbotThreads`.

No comment block appears directly above `chatbotThreads`.

The boundary ends before the Mentions rebuild comment block.

The moved source contains all three chatbot tables and their type aliases.

The chatbot definitions contain no insert Zod builders.

## Membership check

The search finds no `chatbotThreads`, `chatbotMessages`, or `chatbotTokenUsage` symbol in `shared/schema.ts`.

No barrel table has a foreign key to a chatbot table.

The barrel re-exports `shared/schema/chatbot.ts`.

## Import direction

`shared/schema/chatbot.ts` imports `brands` from `./brands`.

`shared/schema/chatbot.ts` imports `users` from `./identity`.

`chatbotMessages` references the local `chatbotThreads` table.

The module imports no symbol from the barrel.

## Gate output

```text
PASS  export surface  Export surface unchanged. 260 exports.
PASS  generated SQL  271 statements before, 271 after
PASS  typecheck
PASS  lint
PASS  format
PASS  tests  Tests  1684 passed | 91 skipped (1775)

All 6 gates pass. The split is safe to commit.
```

## Consumer files

No consumer file changed.
