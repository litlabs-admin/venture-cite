# Slice S03-client-hooks

Files assigned: 16
Files read in full: 16
Total lines read: 2924

## Findings

### F-S03-client-hooks-001 | critical | security
File: client/src/hooks/use-auth.ts:27-31, 52-58
What the code does: `fetchUser` returns `null` after a 401. The query cache clears only after the explicit logout mutation succeeds.
Why it is wrong: A session expiry does not clear cached data from the previous user.
How it fails (concrete input or sequence): User A's session expires. User B signs in within the cache lifetime. Cached brand, article, and citation queries can render User A's data before their next request completes.
Confidence: high

### F-S03-client-hooks-002 | high | correctness
File: client/src/hooks/useArticleAutoSave.ts:48-57, 74-78
What the code does: `flush` removes the queued patch before the request. The catch handler swallows the request error without restoring the patch.
Why it is wrong: A failed network request loses the only copy of the pending change.
How it fails (concrete input or sequence): A user edits a draft. The debounced PUT fails because the network is unavailable. The user stops editing. No later patch retries the lost change, so the server keeps the old value.
Confidence: high

### F-S03-client-hooks-003 | high | concurrency
File: client/src/hooks/useArticleAutoSave.ts:34-42, 44-57, 83-98
What the code does: Timers and the queued patch stay shared across renders. Each timer calls a `flush` closure that captured the article ID from its render.
Why it is wrong: Changing the active article does not cancel or isolate pending work from the previous article.
How it fails (concrete input or sequence): A user edits article A and changes to article B before the debounce fires. The old timer can flush the shared queue through article A's closure. The request can write article B's fields to article A and use article B's expected version.
Confidence: high

### F-S03-client-hooks-004 | high | correctness
File: client/src/hooks/useChatbot.ts:279-285
What the code does: `regenerate` removes the last user message from local state, then calls `send` from the same render.
Why it is wrong: `send` still captures the old message array and builds the request from it.
How it fails (concrete input or sequence): A thread contains a user message and an assistant reply. The user clicks regenerate. The request contains the old assistant reply and a second copy of the user message.
Confidence: high

### F-S03-client-hooks-005 | high | concurrency
File: client/src/hooks/useChatbot.ts:66-83, 161-203, 228-250, 294-298
What the code does: Selecting a thread changes `activeThreadId`, but it does not abort the current stream. Stream deltas append to the current `messages` state.
Why it is wrong: A stream for one thread can update the transcript for another selected thread.
How it fails (concrete input or sequence): The user starts a reply in thread A, opens history, and selects thread B before the stream ends. A later delta from A appends to B's local transcript. The UI then shows A's reply in B.
Confidence: high

### F-S03-client-hooks-006 | high | concurrency
File: client/src/hooks/useChatbot.ts:66-81, 170-201
What the code does: A thread with a different brand is detached only when its `messageCount` is greater than zero. A zero-message thread remains active during a brand change.
Why it is wrong: The next request sends that old thread ID with the new brand ID.
How it fails (concrete input or sequence): The user creates an empty chat for brand A, switches to brand B, and sends a message. The request uses the brand A thread ID and brand B context, so the message is stored in a thread with the wrong brand association.
Confidence: high

### F-S03-client-hooks-007 | high | availability
File: client/src/hooks/useScrapeRunStream.ts:191-197
What the code does: A stream EOF while the status is `streaming` recursively calls `consume` with an increased retry count.
Why it is wrong: This branch has no retry limit and no delay.
How it fails (concrete input or sequence): A proxy repeatedly closes the stream without a `done` event. The browser opens streams in an unbounded tight loop and never reaches the error state.
Confidence: high

### F-S03-client-hooks-008 | high | correctness
File: client/src/hooks/useMentions.ts:30-39, 68-77, 124-135, 181-186
What the code does: The hook exposes `newSinceLastScan`, stores it in the URL, and sends it as a query parameter.
Why it is wrong: The mentions list contract does not use this parameter, so the selected filter does not change the returned rows.
How it fails (concrete input or sequence): The user selects `New since last scan`. The hook requests `newSinceLastScan=true`, but the list endpoint applies the other filters only. The list still contains old mentions.
Confidence: high

### F-S03-client-hooks-009 | high | correctness
File: client/src/hooks/useMentions.ts:271-279
What the code does: The cooldown result compares `cooldownNextAt` with the current time inside `useMemo`.
Why it is wrong: No timer or query update causes a render when the date passes.
How it fails (concrete input or sequence): A scan request returns a cooldown time. The user stays on the page until that time passes. The button remains disabled because `scanCooldown` does not recompute until another state change.
Confidence: high

### F-S03-client-hooks-010 | medium | correctness
File: client/src/hooks/use-persisted-state.ts:12-18
What the code does: The state initializer reads `localStorage` during the first render and uses the default when storage is unavailable.
Why it is wrong: Server rendering uses the default, while client hydration can use a different stored value.
How it fails (concrete input or sequence): A user has a stored non-default tab. The server renders the default tab. Hydration reads the stored tab and produces different markup, which can cause a hydration mismatch and a client re-render.
Confidence: high

### F-S03-client-hooks-011 | medium | correctness
File: client/src/hooks/useArticleAutoSave.ts:20-21, 59-67
What the code does: On a 409 response, the hook shows a text toast and returns. The toast has no action, and the hook does not fetch the current article.
Why it is wrong: The code does not provide the reload action or latest content promised by the surrounding behavior.
How it fails (concrete input or sequence): Another tab edits the article first. The autosave receives 409. The user sees a message but has no in-app reload action and cannot compare the current server content.
Confidence: high

### F-S03-client-hooks-012 | medium | correctness
File: client/src/hooks/useTourState.ts:38-45
What the code does: The mutation error handler writes an error to the browser console and invalidates the state query.
Why it is wrong: The user receives no visible failure message, although the local comment says the failure is not silent.
How it fails (concrete input or sequence): The user changes the tour suppression setting while the PATCH request fails. The setting does not persist, and the UI gives no error or retry control.
Confidence: high

### F-S03-client-hooks-013 | medium | resource leak
File: client/src/hooks/useActiveCitationRuns.ts:42, 55-59
What the code does: The module stores an empty-poll count for every brand ID in `emptyStreaks`.
Why it is wrong: The map has no deletion or size limit.
How it fails (concrete input or sequence): A long-lived browser tab visits an unbounded number of brands. Each brand ID remains in memory after the query is no longer active.
Confidence: high

### F-S03-client-hooks-014 | low | dead code
File: client/src/hooks/usePrompts.ts:305-314
What the code does: The file exports `usePromptGenerations`.
Why it is wrong: No current client or server file imports this export.
How it fails (concrete input or sequence): The generations query cannot run through the current application because no rendered consumer calls the hook. Its endpoint and response type can drift without an active caller.
Confidence: high

## Files with no findings
- client/src/hooks/use-brand-selection.ts (88 lines)
- client/src/hooks/use-loading-messages.ts (27 lines)
- client/src/hooks/use-mobile.tsx (19 lines)
- client/src/hooks/use-toast.ts (186 lines)
- client/src/hooks/useBrandActivation.ts (119 lines)
- client/src/hooks/useCitationLiveRefresh.ts (48 lines)
- client/src/hooks/useTourReplay.ts (9 lines)

## UNDETERMINED
- None.
