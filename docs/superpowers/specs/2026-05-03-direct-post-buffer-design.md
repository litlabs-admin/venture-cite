# Direct Post to Buffer + Expanded Platforms — Design

**Date:** 2026-05-03
**Status:** Approved, ready for implementation plan

## Goal

After a user generates platform-adapted copy in the Distribute dialog, give them a single-click "Post to Buffer" button on each generated card for every Buffer-supported platform. Expand the platform set so it covers the four major Buffer-supported networks (LinkedIn, Twitter, Facebook, Instagram) in addition to the existing copy-only platforms (Medium, Reddit, Quora). Persist the posted state across dialog close/reopen so a user who returns to an article doesn't lose track of what's already published.

## Why

Today the Distribute panel generates platform-tailored copy, but the only way to publish it through Buffer is to copy the text and paste it into Buffer's web app. The user has Buffer connected via BYOK; the API key works; the dialog already shows "Buffer connected · N channels". The path from "I have copy" to "the copy is queued in Buffer" is one click of friction away from one click. This design closes that gap.

Reddit was previously assumed to be Buffer-supported and is not. Buffer-supported destinations for this design: **LinkedIn, Twitter, Facebook, Instagram**. Copy-only destinations: **Medium, Reddit, Quora** (no Post-to-Buffer button surfaced; existing Edit / Copy actions remain).

## Architecture

Three independent additions sit on top of the existing Distribute / Buffer integration:

1. **Server-side prompt + endpoint changes** — three new platform prompts (Twitter / Facebook / Instagram) with hard character limits embedded; a new `POST /api/distributions/:distributionId/buffer-post` route that takes a generated distribution row + a Buffer `channelId` and queues the post; refactor of Buffer GraphQL helpers into a shared module so the new route and the existing `/api/buffer/post` reuse one code path.
2. **Client-side card UI** — per-card four-state Post-to-Buffer button (already-posted / not-connected / connectable / disabled-no-channel) with a popover channel picker when the user has multiple Buffer channels matching one platform.
3. **Posted-state persistence** — repurpose the existing `distributions.platformPostId` column correctly (today it's pre-stamped with a fake string at generation time; we stop doing that and only set it when a real Buffer post id comes back). On dialog open, the dialog hydrates `generatedContent` from existing distributions so reopening shows the same cards with their posted state intact.

## Section 1 — Scope

**In:**
- 3 new platform prompts: Twitter (≤280 chars), Facebook (≤2000 chars conversational), Instagram (hook in first 125 chars, ≤2200 total, hashtags grouped).
- Server cap on platforms accepted per generate request: 5 → 7.
- Stop pre-stamping `distributions.platform_post_id` at generation time.
- New endpoint `POST /api/distributions/:distributionId/buffer-post` body `{channelId}` — queues the row's content via Buffer's GraphQL `createPost` mutation (`mode: addToQueue`).
- Per-card Post-to-Buffer button on LinkedIn / Twitter / Facebook / Instagram cards, with the four-state machine.
- Channel-picker popover for the multi-match case.
- Hydrate `generatedContent` from `GET /api/distributions/:articleId` on dialog open so the posted state survives close/reopen.

**Out:**
- Buffer's `customScheduled` mode (per-post `dueAt` picker). Always `addToQueue`.
- Server-side dedup of double-clicks (Buffer doesn't dedup; the cost of a duplicate row outweighs the cost of building dedup).
- Image / media attachments. Text-only.
- Client-side character-count validation before posting. Prompt + Buffer enforce; we display Buffer's error message verbatim on rejection.
- Buffer Idea / draft mode.
- Twitter thread / multi-tweet support. One card → one post.

## Section 2 — Server changes

### 2.1 New prompt templates with character limits ([server/routes/articles.ts](../../../server/routes/articles.ts))

In the `platformPrompts` map inside `POST /api/distribute/:articleId` (around line 404), add three new entries. Each prompt bakes the limit in as a literal "Hard constraint:" sentence so the model treats it as a non-negotiable, plus a final-line reminder. Existing LinkedIn / Medium / Reddit / Quora prompts remain unchanged.

**Twitter:**
```
Convert this article into a single Twitter/X post.
Hard constraint: total post must be ≤ 280 characters including hashtags. Do not exceed.
Include:
- A strong hook in the first sentence
- 1–2 highly relevant hashtags
- No preamble, no "Here's a post:" — output the post text only
${brand ? `Brand: ${brand.companyName}` : ""}

Article title: ${articleTitle}
Content: ${articleContent}
```

**Facebook:**
```
Convert this article into a Facebook post.
Hard constraint: total post must be ≤ 2000 characters. Aim for under 1500 for engagement.
Include:
- A scroll-stopping opening sentence
- 2–4 short paragraphs (Facebook engagement falls off past 2000 chars)
- 1–2 emojis where natural, not forced
- 3–5 relevant hashtags at the end
- Conversational tone, not corporate
${brand ? `Brand: ${brand.companyName}` : ""}

Article title: ${articleTitle}
Content: ${articleContent}
```

**Instagram:**
```
Convert this article into an Instagram caption.
Hard constraints:
- Total caption ≤ 2200 characters
- The first 125 characters are critical — that's what shows before the "more" cut. Front-load the hook there.
Include:
- An attention-grabbing hook in the first 125 characters
- Body paragraphs separated by blank lines (use line breaks, no markdown)
- Up to 30 relevant hashtags grouped together at the end on a separate line, after a "." or "•••" separator
- Friendly, authentic tone
${brand ? `Brand: ${brand.companyName}` : ""}

Article title: ${articleTitle}
Content: ${articleContent}
```

The `${brand ? ... : ""}` interpolation pattern matches the existing prompts in the file.

### 2.2 Lift the platform cap ([server/routes/articles.ts:375](../../../server/routes/articles.ts#L375))

Current:
```ts
.slice(0, 5);
```
Change to:
```ts
.slice(0, 7);
```

### 2.3 Stop fake-stamping `platformPostId` at generation ([server/routes/articles.ts:484](../../../server/routes/articles.ts#L484))

Current line:
```ts
platformPostId: `${platform.toLowerCase()}_${article.id}_${Date.now()}`,
```

Remove this line from the `storage.updateDistribution` call. The field stays NULL on a fresh distribution and only gets set when a real Buffer post id comes back.

### 2.4 Return `distributionId` in the generate response ([server/routes/articles.ts:487](../../../server/routes/articles.ts#L487))

Current per-result return:
```ts
return { platform, status: "success" as const, content: formattedContent };
```

Change to:
```ts
return {
  platform,
  status: "success" as const,
  content: formattedContent,
  distributionId: distribution.id,
  platformPostId: null as string | null,
};
```

The client uses `distributionId` to address the new `/buffer-post` endpoint without an extra round-trip to `GET /api/distributions/:articleId`.

### 2.5 New shared helper `server/lib/bufferPost.ts` (NEW)

Extract the GraphQL fetch + `createPost` mutation logic out of [server/routes/buffer.ts](../../../server/routes/buffer.ts) into a reusable module. Signature:

```ts
export type BufferPostResult =
  | { ok: true; postId: string }
  | { ok: false; code: "not_connected" | "rejected" | "unreachable"; message?: string };

export async function postToBuffer(
  userId: string,
  channelId: string,
  text: string,
  scheduledAt?: string,
): Promise<BufferPostResult>;
```

Internals:
- Look up `users.bufferAccessToken`. If null → `{ok:false, code:"not_connected"}`.
- Decrypt via `tokenCipher.decryptToken`.
- POST to `https://api.buffer.com` with `Authorization: Bearer <key>` and the existing `createPost` mutation:
  ```graphql
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess { post { id text dueAt } }
      ... on MutationError { message }
    }
  }
  ```
- `mode: addToQueue` if `scheduledAt` is undefined, else `mode: customScheduled` with `dueAt: new Date(scheduledAt).toISOString()`.
- On a network throw → `{ok:false, code:"unreachable"}`.
- On non-2xx response or top-level GraphQL `errors[]` → `{ok:false, code:"unreachable"}` (treat upstream protocol errors as transient).
- On `MutationError` payload → `{ok:false, code:"rejected", message: payload.message}`.
- On `PostActionSuccess` → `{ok:true, postId: payload.post.id}`.

Both `/api/buffer/post` and the new `/api/distributions/:distributionId/buffer-post` call this helper.

### 2.6 Refactor `/api/buffer/post` to use the helper ([server/routes/buffer.ts](../../../server/routes/buffer.ts))

The existing route's body becomes a thin shim:

```ts
const { text, channelId, scheduledAt } = req.body ?? {};
if (!text || typeof text !== "string") return res.status(400).json({ success: false, error: "text is required" });
if (!channelId || typeof channelId !== "string") return res.status(400).json({ success: false, error: "channelId is required" });
const result = await postToBuffer(user.id, channelId, text, scheduledAt);
if (result.ok) return res.json({ success: true, data: { postId: result.postId } });
if (result.code === "not_connected") return res.status(403).json({ success: false, error: "Buffer is not connected. Connect it first." });
if (result.code === "rejected") return res.status(502).json({ success: false, error: result.message ?? "Buffer post failed" });
return res.status(502).json({ success: false, error: "Buffer post failed" });
```

`bufferGraphQL` and `formatService` stay in `server/routes/buffer.ts` (used by `/connect` and `/profiles`); only the `createPost` logic moves to the new helper.

### 2.7 New endpoint `POST /api/distributions/:distributionId/buffer-post` ([server/routes/articles.ts](../../../server/routes/articles.ts))

```
POST /api/distributions/:distributionId/buffer-post
Auth: isAuthenticated
Body: { channelId: string }

Steps:
  1. requireUser(req)
  2. Load distribution by id; 404 if not found
  3. Load parent article; 404 if not found OR article.userId !== user.id
  4. Validate channelId is a non-empty string; 400 otherwise
  5. Read distribution.metadata.content; 400 no_content if missing/empty/whitespace
  6. result = await postToBuffer(user.id, channelId, content)
  7. Branch on result:
       ok: UPDATE distributions SET platform_post_id = result.postId,
                                     status = 'scheduled',
                                     distributed_at = now()
           Respond 200 { success: true, data: { platformPostId: result.postId } }
       not_connected: 403 { success: false, error: "not_connected" }
       rejected: 502 { success: false, error: result.message }
       unreachable: 502 { success: false, error: "buffer_unreachable" }
```

The route lives in `server/routes/articles.ts` because it's a distribution-scoped action and that file already owns the distribution CRUD endpoints. Ownership is checked via `requireArticle(distribution.articleId, user.id)` — same pattern as `PATCH /api/distribute/entry/:distributionId` already does.

## Section 3 — Client changes

### 3.1 Platform list ([client/src/components/articles/DistributeDialog.tsx:28](../../../client/src/components/articles/DistributeDialog.tsx#L28))

```ts
const DISTRIBUTION_PLATFORMS = [
  "LinkedIn",
  "Twitter",
  "Facebook",
  "Instagram",
  "Medium",
  "Reddit",
  "Quora",
];
```

Buffer-supported platforms come first; copy-only platforms follow. Each renders as the existing checkbox row — no change to row layout.

A constant identifies which platforms support Buffer posting:

```ts
const BUFFER_SUPPORTED_PLATFORMS = new Set(["LinkedIn", "Twitter", "Facebook", "Instagram"]);
```

The Post-to-Buffer button only renders for platforms in this set.

### 3.2 Generated card row type widens

The `generatedContent` state currently holds:
```ts
Array<{ platform: string; status: string; content?: string }>
```

Widen to:
```ts
Array<{
  platform: string;
  status: string;
  content?: string;
  distributionId?: string;
  platformPostId?: string | null;
}>
```

Both new fields come back from the `/api/distribute/:articleId` response (per §2.4) and from the hydrate-from-history effect (per §3.6).

### 3.3 Channel matcher returns all matches ([DistributeDialog.tsx:91](../../../client/src/components/articles/DistributeDialog.tsx#L91))

Current:
```ts
const matchBufferProfile = (platform: string) => {
  const p = platform.toLowerCase();
  const matches = bufferProfiles.filter(/* ... */);
  return matches.length === 1 ? matches[0] : null;
};
```

Replace with:
```ts
const matchBufferChannels = (platform: string) => {
  const p = platform.toLowerCase();
  return bufferProfiles.filter(
    (bp) =>
      bp.service?.toLowerCase().includes(p) || bp.formattedService?.toLowerCase().includes(p),
  );
};
```

The new function returns the full match list. The Post button reads `matches = matchBufferChannels(card.platform)` and decides its state from `matches.length`.

### 3.4 Replace `postToBufferMutation` with `postDistributionMutation` ([DistributeDialog.tsx:70](../../../client/src/components/articles/DistributeDialog.tsx#L70))

```ts
const postDistributionMutation = useMutation({
  mutationFn: async ({ distributionId, channelId }: { distributionId: string; channelId: string }) => {
    const r = await apiRequest("POST", `/api/distributions/${distributionId}/buffer-post`, { channelId });
    const json = await r.json();
    return { status: r.status, body: json };
  },
  onSuccess: ({ status, body }, vars) => {
    if (status === 200 && body?.success) {
      // Optimistic flip: update the local card before the refetch lands.
      setGeneratedContent((prev) =>
        prev.map((c) =>
          c.distributionId === vars.distributionId
            ? { ...c, platformPostId: body.data.platformPostId }
            : c,
        ),
      );
      queryClient.invalidateQueries({ queryKey: [`/api/distributions/${articleId}`] });
      setCardErrors((prev) => {
        const next = { ...prev };
        delete next[vars.distributionId];
        return next;
      });
      toast({ title: "Posted to Buffer" });
      return;
    }
    if (status === 403 && body?.error === "not_connected") {
      queryClient.invalidateQueries({ queryKey: ["/api/buffer/profiles"] });
      toast({
        title: "Buffer is disconnected",
        description: "Reconnect to post.",
        variant: "destructive",
      });
      return;
    }
    setCardErrors((prev) => ({
      ...prev,
      [vars.distributionId]: body?.error ?? "Buffer post failed",
    }));
  },
  onError: (_err, vars) => {
    setCardErrors((prev) => ({
      ...prev,
      [vars.distributionId]: "Network error — try again",
    }));
  },
});
```

New piece of local state:

```ts
const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
```

Cleared per-card on a successful post or when the user clicks the button again (handled by the button component itself before invoking the mutation).

### 3.5 New component `client/src/components/articles/PlatformPostButton.tsx` (NEW)

Self-contained four-state button + popover. Props:

```ts
interface PlatformPostButtonProps {
  platform: string;                    // "LinkedIn" / "Twitter" / "Facebook" / "Instagram"
  distributionId: string | undefined;  // undefined → button rendered disabled with "Generating…"
  platformPostId: string | null | undefined;  // non-null → already posted
  bufferConnected: boolean;
  matches: Array<{ id: string; service: string; formattedService: string; username: string; avatar: string | null }>;
  isPosting: boolean;                  // postDistributionMutation.isPending && variables?.distributionId === this distId
  error: string | undefined;           // cardErrors[distributionId]
  onPost: (channelId: string) => void; // calls postDistributionMutation.mutate
  onConnectClick: () => void;          // opens BufferConnectDialog
}
```

State machine (in order of precedence):

1. `!distributionId` → disabled button labeled "Generating…" (shouldn't normally render; defensive).
2. `platformPostId` truthy → button: `Posted ✓ View in Buffer` (link). Opens the queue page `https://publish.buffer.com/queue` in a new tab. (Buffer's GraphQL `createPost` mutation does not return a stable per-post web URL on schedule — `dueAt` is set but the post hasn't published yet, so `externalLink` is null. Linking to the queue is the correct landing page until publish.)
3. `!bufferConnected` → button: `Connect Buffer to post`. Click → `onConnectClick()`.
4. `bufferConnected && matches.length === 0` → button: `Post to Buffer` (disabled). Tooltip via `<Tooltip>` from `@/components/ui/tooltip`: `No {platform} channel in your Buffer.`
5. `bufferConnected && matches.length === 1` → button: `Post to Buffer`. Click → `onPost(matches[0].id)`. While `isPosting`: spinner + "Posting…", disabled.
6. `bufferConnected && matches.length > 1` → button: `Post to Buffer ▾` opens a `<Popover>` listing each match. Each list item: `<Button variant="ghost">` with username + service. Click → close popover, `onPost(channel.id)`.

If `error` is set, render `<p className="text-sm text-red-600 mt-1">Buffer rejected: {error}</p>` below the button.

### 3.6 Merge new generations with existing cards (partial regeneration)

When a user generates copy for a subset of platforms (e.g. just Twitter today, having generated LinkedIn yesterday), the existing LinkedIn card must remain on screen alongside the new Twitter card. The current `distributeMutation.onSuccess` does `setGeneratedContent(data.data)` which **replaces** the array — that would erase the LinkedIn card.

Change to a per-platform merge:

```ts
onSuccess: async (data) => {
  setGeneratedContent((prev) => {
    const incoming = new Map<string, (typeof prev)[number]>();
    for (const row of data.data) incoming.set(row.platform, row);
    const merged = prev.map((row) => incoming.get(row.platform) ?? row);
    for (const row of data.data) {
      if (!prev.some((p) => p.platform === row.platform)) merged.push(row);
    }
    return merged;
  });
  setView("results");
  await refetchHistory();
  // ... existing toast logic
},
```

This way, generating Twitter alone preserves a previously-shown LinkedIn card with its `platformPostId` (posted state) intact.

### 3.7 Hydrate `generatedContent` from history on dialog open ([DistributeDialog.tsx](../../../client/src/components/articles/DistributeDialog.tsx))

After the existing `historyData` query resolves, if `generatedContent` is empty (i.e. fresh dialog open, no in-session generation yet), populate it from the most-recent successful distribution per platform:

```ts
useEffect(() => {
  if (!historyData?.data || generatedContent.length > 0) return;
  const latestByPlatform = new Map<string, any>();
  for (const d of historyData.data) {
    if (d.status !== "success" && d.status !== "scheduled") continue;
    if (!d.metadata?.content) continue;
    const existing = latestByPlatform.get(d.platform);
    if (!existing || new Date(d.createdAt) > new Date(existing.createdAt)) {
      latestByPlatform.set(d.platform, d);
    }
  }
  if (latestByPlatform.size === 0) return;
  setGeneratedContent(
    Array.from(latestByPlatform.values()).map((d) => ({
      platform: d.platform,
      status: "success",
      content: d.metadata.content,
      distributionId: d.id,
      platformPostId: d.platformPostId ?? null,
    })),
  );
  setView("results");
}, [historyData, articleId]);
```

Note: the predicate accepts `status === "success"` (generation succeeded, not posted) AND `status === "scheduled"` (generation succeeded AND posted to Buffer). The existing History tab filter at [line 55](../../../client/src/components/articles/DistributeDialog.tsx#L55) needs to be widened similarly so the History tab still shows posted rows:

Current:
```ts
const history = (historyData?.data || []).filter(
  (d: any) => d.status === "success" && d.metadata?.content?.trim(),
);
```

Change to:
```ts
const history = (historyData?.data || []).filter(
  (d: any) =>
    (d.status === "success" || d.status === "scheduled") && d.metadata?.content?.trim(),
);
```

### 3.8 Wire `PlatformPostButton` into the per-card render

In the existing card render (around [line 200-220](../../../client/src/components/articles/DistributeDialog.tsx#L200), under the Edit / Copy buttons), conditionally append the new button only for Buffer-supported platforms:

```tsx
{BUFFER_SUPPORTED_PLATFORMS.has(card.platform) && (
  <PlatformPostButton
    platform={card.platform}
    distributionId={card.distributionId}
    platformPostId={card.platformPostId}
    bufferConnected={bufferConnected}
    matches={matchBufferChannels(card.platform)}
    isPosting={
      postDistributionMutation.isPending &&
      postDistributionMutation.variables?.distributionId === card.distributionId
    }
    error={card.distributionId ? cardErrors[card.distributionId] : undefined}
    onPost={(channelId) =>
      card.distributionId &&
      postDistributionMutation.mutate({ distributionId: card.distributionId, channelId })
    }
    onConnectClick={() => {
      // BufferConnectDialog has its own internal trigger; surface it via a
      // shared open-state ref or simply prompt the user via the connected
      // strip at the top of the dialog. Concrete wiring decided during
      // implementation.
    }}
  />
)}
```

The `onConnectClick` mechanism: lift a `bufferConnectOpen: boolean` state to `DistributeDialog`. The top connection strip's `<BufferConnectDialog connected={false} />` becomes a controlled instance reading that state via `open`/`onOpenChange` props (Radix Dialog supports controlled mode). The per-card button's `onConnectClick` calls `setBufferConnectOpen(true)`. This avoids fragile scroll-and-pulse heuristics and gives a single source of truth for the connect dialog's open state regardless of where the trigger lives.

## Section 4 — Error handling

| Scenario | Server response | Client UI |
|---|---|---|
| Distribution not found / not owned | `404 not_found` | Toast: "Couldn't find that draft." |
| Distribution has no `metadata.content` | `400 no_content` | Inline below button: "No content to post — regenerate first." |
| Buffer not connected (token null at post time) | `403 not_connected` | Toast: "Buffer is disconnected — reconnect to post." Invalidate `/api/buffer/profiles`. |
| Buffer rejects (text > 280, channel disconnected, queue full) | `502` with upstream message | Inline: "Buffer rejected: {message}". Button stays clickable. |
| Buffer GraphQL unreachable / 5xx / network throw | `502 buffer_unreachable` | Inline: "Couldn't reach Buffer. Try again." |
| User picks `channelId` not on their account | Buffer returns its own MutationError | Same as the rejection path. No client-side guard. |
| Two tabs both click Post on the same row | Both succeed; two `geo_rankings`-equivalent dup posts in Buffer | Acceptable; we do not add server-side dedup. |

The `404` path returns a generic `not_found` so we don't reveal whether the id exists for some other user — matches CLAUDE.md anti-enumeration rule.

## Section 5 — Database

No schema change. The existing `distributions` table is sufficient:
- `metadata` (jsonb) — still holds `{content: string}`.
- `platform_post_id` (text, nullable) — Buffer's post id when posted; NULL otherwise.
- `status` (text) — `pending` → `success` (generated) → `scheduled` (posted to Buffer). The "scheduled" status was previously written to mean "we recorded a fake post id"; now it means "Buffer accepted the post".
- `distributed_at` (timestamp) — set when Buffer accepts the post (best-effort; we don't have Buffer's actual queue execution time).

Migration: none. Pre-existing rows where `platform_post_id` is a fake `<service>_<articleId>_<timestamp>` string are not cleaned up — they're harmless because the new client only treats a row as "already posted" if `platform_post_id` is non-null. Pre-existing rows DO appear as "Posted ✓" with a "View in Buffer" link that goes to the queue page; the queue page may or may not contain the imagined post. Not a concern in practice (small dataset, pre-launch).

If a clean state is desired, a one-time SQL backfill is straightforward but optional:
```sql
UPDATE distributions
SET platform_post_id = NULL
WHERE platform_post_id ~ '^(linkedin|medium|reddit|quora)_[0-9a-f-]+_[0-9]+$';
```

## Section 6 — Tests

### 6.1 New: `tests/unit/distributionBufferPost.test.ts`

Mirrors the harness in `tests/unit/bufferConnect.test.ts` (Express shim, manual req/res, hoisted DB stubs, mocked `fetch`, mocked `tokenCipher`). Six test cases:

1. **Success.** Distribution exists with `metadata.content = "hello"`, parent article owned by user, Buffer mutation returns `PostActionSuccess` with `post.id = "post_123"`. Asserts `200`, `body.success === true`, `body.data.platformPostId === "post_123"`, and the `db.update` chain was called with `{platformPostId: "post_123", status: "scheduled", distributedAt: <Date>}`.
2. **Buffer not connected.** `users.bufferAccessToken = null`. Asserts `403 not_connected`, no Buffer fetch, no DB update on the distribution.
3. **No content.** Distribution row has `metadata: {}` (or `metadata: null`). Asserts `400 no_content`, no Buffer fetch, no DB update.
4. **Distribution not owned.** Article's `userId` differs from `req.user.id`. Asserts `404 not_found`, no Buffer fetch.
5. **Buffer MutationError.** `createPost` returns `{message: "Tweet too long."}`. Asserts `502` with `error: "Tweet too long."`, distribution unchanged.
6. **Buffer unreachable.** `fetch` throws `ECONNRESET`. Asserts `502 buffer_unreachable`, distribution unchanged.

### 6.2 New: `tests/unit/distributePrompts.test.ts`

Three tiny tests asserting the literal character-cap sentences appear in the Twitter / Facebook / Instagram prompt templates respectively. Guards against future edits silently dropping the constraint:

```ts
import { TWITTER_PROMPT_TEMPLATE, FACEBOOK_PROMPT_TEMPLATE, INSTAGRAM_PROMPT_TEMPLATE } from "...";
expect(TWITTER_PROMPT_TEMPLATE).toContain("≤ 280 characters");
expect(FACEBOOK_PROMPT_TEMPLATE).toContain("≤ 2000 characters");
expect(INSTAGRAM_PROMPT_TEMPLATE).toContain("first 125 characters");
```

This requires the prompts to be exported as named constants from `server/routes/articles.ts` rather than buried inline inside the handler. Acceptable refactor — they're more testable and grep-able as named exports. Move them to a small co-located module if the file is already too big; otherwise inline export.

### 6.3 Existing tests preserved

- `tests/unit/bufferConnect.test.ts` — still passes after the `bufferGraphQL` fetch logic is shared. The `/connect` route path doesn't change.
- The `/api/buffer/post` legacy route's tests (if any — none today) are not added; the route is now a thin wrapper over `postToBuffer`.

### 6.4 Verification gate

```
npx tsc --noEmit             # 0 errors
npm test                     # 227 → ~236 (+6 endpoint, +3 prompt)
npx esbuild server/vercelEntry.ts ... --outfile=api/_bundle.js
                             # bundle clean
```

Manual smoke (post-deploy):
1. Generate distribute copy with all 7 platforms checked.
2. LinkedIn / Twitter / Facebook / Instagram cards render with Post-to-Buffer buttons; Medium / Reddit / Quora cards render without.
3. Click Post-to-Buffer on a card matching exactly one Buffer channel → spinner → success toast → button flips to "Posted ✓ View in Buffer".
4. Buffer's queue (`https://publish.buffer.com/queue`) shows the post.
5. Close and reopen the dialog → the LinkedIn card still shows "Posted ✓".
6. Click Post on a card with zero matching channels → button is disabled with the right tooltip.
7. If the user has multiple Twitter accounts, click Post → popover opens with both → pick one → posts.

## Section 7 — Files summary

**New files:**
- `server/lib/bufferPost.ts` — extracted `postToBuffer` helper.
- `client/src/components/articles/PlatformPostButton.tsx` — per-card button + popover.
- `tests/unit/distributionBufferPost.test.ts` — endpoint tests.
- `tests/unit/distributePrompts.test.ts` — prompt-content assertions.

**Modified files:**
- `server/routes/articles.ts` — 3 new prompts (named-export constants), `slice(0,5)` → `slice(0,7)`, drop fake `platformPostId` stamp, return `distributionId` + `platformPostId: null` in the generate response, new `POST /api/distributions/:distributionId/buffer-post` route.
- `server/routes/buffer.ts` — `/api/buffer/post` becomes a thin shim over `postToBuffer`.
- `client/src/components/articles/DistributeDialog.tsx` — platform list, matcher → all-matches, replace mutation, hydrate `generatedContent` from history on open, widen history filter for `scheduled` status, mount `<PlatformPostButton>` on supported cards.

**Modified files (small):**
- `client/src/components/articles/BufferConnectDialog.tsx` — accept optional `open?: boolean` and `onOpenChange?: (next: boolean) => void` props for controlled mode. When both are passed, use them instead of the internal `useState` so a parent can open/close the dialog. Default behavior (uncontrolled) preserved.

**Unchanged:**
- `shared/schema.ts` (no migration).
- `server/lib/tokenCipher.ts`.

## Section 8 — Out of scope (deferred)

- `customScheduled` mode with a per-post date picker. Always `addToQueue`.
- Server-side post dedup (Buffer doesn't dedup; cost > benefit at this scale).
- Image / media attachments. Text-only.
- Client-side character-count preview (prompt + Buffer enforce; we display Buffer's error verbatim).
- Buffer Idea / draft mode.
- Twitter thread / multi-tweet support.
- Pre-launch backfill of fake `platform_post_id` strings on existing rows. Optional one-line SQL on request.
- Analytics on Buffer post performance (impressions / clicks). Out of scope; Buffer's own dashboard handles it.
