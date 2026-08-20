# Buffer Bring-Your-Own-Key Design

**Date:** 2026-05-03
**Status:** Approved, ready for implementation plan

## Goal

Replace the current platform-owned Buffer OAuth integration with a bring-your-own-key flow. Users generate an access token in Buffer's developer dashboard, paste it into the platform, the platform validates and stores it encrypted, and posts on the user's behalf using that token.

## Why

The OAuth integration requires the platform to maintain a Buffer-registered OAuth app and ship `BUFFER_CLIENT_ID` / `BUFFER_CLIENT_SECRET` env vars. The new flow shifts that responsibility to each user, removes platform-side configuration, and removes the OAuth callback route from the lambda surface.

## Architecture

Single token-paste flow:

1. User creates a Buffer access token in Buffer's developer dashboard.
2. User opens the connection dialog in the app, pastes the token.
3. Server validates the token by calling Buffer's `/user.json` with it.
4. On success, the server encrypts the token (existing `server/lib/tokenCipher.ts`) and writes it to `users.buffer_access_token`.
5. Posting and profile listing use the stored token unchanged from today.

No OAuth. No platform-owned Buffer app. No callback. The platform holds no Buffer client secret because none exists.

## Server changes — [server/routes/buffer.ts](../../../server/routes/buffer.ts)

Full rewrite of the routes file. The new endpoints:

### `POST /api/buffer/connect`

- Body: `{ accessToken: string }`.
- Trim and reject empty / whitespace-only with `400 { error: "missing_token" }`.
- Call `GET https://api.bufferapp.com/1/user.json?access_token=<token>`.
  - On 200: encrypt the token, `UPDATE users SET buffer_access_token = <encrypted> WHERE id = <userId>`. Respond `{ success: true }`.
  - On 401: respond `400 { error: "invalid_token" }`.
  - On other non-2xx or network error: respond `502 { error: "buffer_unreachable" }`.

### `GET /api/buffer/profiles`

Unchanged from today. Returns `{ connected: false, data: [] }` if no token; otherwise decrypts the stored token, calls Buffer `/profiles.json`, returns the mapped profile list.

### `POST /api/buffer/post`

Unchanged from today. Decrypts the stored token, posts via Buffer's `/updates/create.json`.

### `DELETE /api/buffer/connection`

Replaces today's `DELETE /api/auth/buffer`. Sets `users.buffer_access_token = NULL`. Path renamed for namespace consistency with the rest of the new endpoints.

### Routes deleted

- `GET /api/auth/buffer` (OAuth start, 302 to Buffer).
- `GET /api/auth/buffer/callback` (OAuth callback, code-for-token exchange).
- `DELETE /api/auth/buffer` (replaced by `DELETE /api/buffer/connection`).

## Environment variables — removed

Delete the following from `.env.example` and any docs that mention them:

- `BUFFER_CLIENT_ID`
- `BUFFER_CLIENT_SECRET`
- `BUFFER_REDIRECT_URI`

The code stops reading these. No fallback path.

## Database

No schema change. The existing `users.buffer_access_token` column (encrypted text) is reused exactly as before.

## Client changes

The current "Connect Buffer" button navigates the browser to `/api/auth/buffer` (302 to Buffer's OAuth page). Replace with a small connection dialog component.

### Dialog UI

- A single password-style input (`type="password"`) so the token is visually masked.
- Helper text: "Generate an access token in Buffer's developer dashboard." with a `<a>` link to `https://buffer.com/developers/api` (or the most current Buffer docs URL — confirm at implementation time).
- "Connect" button → `POST /api/buffer/connect` with the input value as `accessToken`.
- On success: close the dialog, invalidate the `/api/buffer/profiles` TanStack Query so the profile picker re-fetches and shows the connected accounts. Toast "Buffer connected".
- On `invalid_token`: inline error below the field — "That token didn't work. Double-check it in Buffer's dashboard."
- On `buffer_unreachable`: inline error — "Couldn't reach Buffer. Try again."
- "Disconnect" button when already connected → `DELETE /api/buffer/connection`. Confirms inline.

The dialog lives wherever the current Connect button lives — likely [client/src/pages/articles.tsx](../../../client/src/pages/articles.tsx); confirm during implementation. The button itself is replaced; the surrounding profile picker and post composer continue to consume the existing `/api/buffer/profiles` and `/api/buffer/post` endpoints unchanged.

## Error handling

| Scenario | Server response | UI behavior |
|---|---|---|
| Empty / whitespace token in connect body | `400 missing_token` | Inline "Token is required" |
| Buffer returns 401 to validation call | `400 invalid_token` | Inline "That token didn't work…" |
| Buffer unreachable / 5xx | `502 buffer_unreachable` | Inline "Couldn't reach Buffer. Try again." |
| Token works at connect but later revoked by user in Buffer | `/profiles` and `/post` respond 502 (existing behavior) | User re-pastes a fresh token |
| Encryption failure | Falls through to global error handler | Generic 500 toast |

The "later revoked" case requires no new code — the existing `/profiles` and `/post` routes already 502 on Buffer-side failure. Users notice when posting fails and reconnect.

## Testing

New unit tests in `tests/unit/bufferConnect.test.ts`:

- `POST /api/buffer/connect` with valid token (Buffer `/user.json` mocked to 200): persists encrypted token, response `{ success: true }`.
- `POST /api/buffer/connect` with invalid token (Buffer mocked to 401): response `400 invalid_token`, no DB write.
- `POST /api/buffer/connect` with empty body: response `400 missing_token`.
- `POST /api/buffer/connect` when Buffer returns 5xx: response `502 buffer_unreachable`, no DB write.
- `DELETE /api/buffer/connection`: clears the column.

Existing tests for `/profiles` and `/post` (if any) are untouched. Verification gate before merge:

- `npm run check` — tsc clean.
- `npm run lint` — zero errors.
- `npm test` — all green.
- Manual: paste a real token in dev, confirm profiles load and a test post publishes.

## Files to touch

**Modify:**
- [server/routes/buffer.ts](../../../server/routes/buffer.ts) — remove OAuth routes, add `/connect`, rename delete route.
- `.env.example` — remove `BUFFER_CLIENT_ID`, `BUFFER_CLIENT_SECRET`, `BUFFER_REDIRECT_URI`.
- Client page hosting the Connect button (likely [client/src/pages/articles.tsx](../../../client/src/pages/articles.tsx)) — replace OAuth-redirect button with the new dialog.

**New:**
- Connection dialog component (e.g. `client/src/components/BufferConnectDialog.tsx`).
- `tests/unit/bufferConnect.test.ts`.

**Unchanged:**
- [server/lib/tokenCipher.ts](../../../server/lib/tokenCipher.ts) — encryption/decryption helpers reused as-is.
- `users.buffer_access_token` column — schema unchanged.
- `GET /api/buffer/profiles` and `POST /api/buffer/post` route handlers — logic unchanged.

## Out of scope

- Token rotation reminders / expiry tracking. Buffer access tokens don't expire; revisit only if Buffer changes that policy.
- Storing the Buffer profile list in a local table. The `/profiles` route already returns it on demand; caching is premature.
- Migrating existing OAuth-connected users. Per the user's decision, OAuth is removed entirely with no migration path. Existing connected users will need to reconnect with a manually-generated token after this ships. (If the user later wants a migration window, that is a separate spec.)
