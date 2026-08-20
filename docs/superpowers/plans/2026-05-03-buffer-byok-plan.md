# Buffer Bring-Your-Own-Key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace platform-owned Buffer OAuth with a bring-your-own-key flow where users paste a Buffer access token they generated themselves.

**Architecture:** A single `POST /api/buffer/connect` endpoint validates the user-supplied token against Buffer's `/user.json`, then stores it AES-256-GCM encrypted in the existing `users.buffer_access_token` column. The OAuth start/callback routes are deleted along with the platform-side Buffer app credentials. Profile listing and posting endpoints stay byte-for-byte identical — only the token's origin changes. The client's "Connect Buffer" link in `DistributeDialog` is replaced by a small dialog that posts the token and surfaces validation errors inline.

**Tech Stack:** Express 4 (ESM), Drizzle ORM, vitest, React 18 + TanStack Query, Radix UI dialog primitives (already in the project).

**Spec:** [docs/superpowers/specs/2026-05-03-buffer-byok-design.md](../specs/2026-05-03-buffer-byok-design.md)

---

## File structure

| File | Responsibility | Status |
|---|---|---|
| `server/routes/buffer.ts` | Express routes for Buffer connect/disconnect/profiles/post | Modify (rewrite) |
| `server/env.ts` | Zod schema for env vars; drop the three Buffer OAuth vars and the refine() that tied them to BUFFER_ENCRYPTION_KEY | Modify |
| `.env.example` | Document required env vars; remove BUFFER_CLIENT_ID/SECRET/REDIRECT_URI and rewrite the BUFFER_ENCRYPTION_KEY comment so it no longer references the OAuth flow | Modify |
| `docs/feature_flows.md` | Two stale references to the OAuth env vars + a sample OAuth URL | Modify |
| `client/src/components/articles/BufferConnectDialog.tsx` | Self-contained dialog: input, validate, error display, disconnect | Create |
| `client/src/components/articles/DistributeDialog.tsx` | Replace the `<a href="/api/auth/buffer">` button with `<BufferConnectDialog />` | Modify (one block) |
| `tests/unit/bufferConnect.test.ts` | Endpoint coverage: connect (success / 401 / empty / 5xx), disconnect | Create |

The `tokenCipher` helpers (`encryptToken`, `decryptToken`) and the `users.buffer_access_token` column are reused without change.

---

## Task 1: Endpoint test scaffold (compiles, runs, fails meaningfully)

**Files:**
- Create: `tests/unit/bufferConnect.test.ts`

- [ ] **Step 1.1: Create the test file with one failing import-level test**

```ts
// tests/unit/bufferConnect.test.ts
//
// Coverage for POST /api/buffer/connect and DELETE /api/buffer/connection.
// The legacy OAuth routes (GET /api/auth/buffer + callback) are deleted
// in this same change; we don't test them because they no longer exist.
//
// Strategy: build a minimal Express app, mount the buffer routes against
// a stub `req.user`, mock the database update + Buffer's /user.json, and
// drive the route via a manual request/response shim (same pattern used
// in tests/unit/cronOrchestrator.test.ts so vitest's module mocks behave).
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";

const dbStubs = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: {
    update: (...args: unknown[]) => {
      dbStubs.update(...args);
      return { set: dbStubs.set.mockReturnValue({ where: dbStubs.where }) };
    },
    select: (...args: unknown[]) => {
      dbStubs.select(...args);
      return { from: dbStubs.from.mockReturnValue({ where: dbStubs.where.mockReturnValue({ limit: dbStubs.limit }) }) };
    },
  },
}));

vi.mock("../../server/lib/tokenCipher", () => ({
  encryptToken: (s: string) => `enc:v1:${s}`,
  decryptToken: (s: string) => s.replace(/^enc:v1:/, ""),
}));

const fetchStub = vi.fn();
vi.stubGlobal("fetch", fetchStub);

const { setupBufferRoutes } = await import("../../server/routes/buffer");

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "user-1" };
    next();
  });
  setupBufferRoutes(app);
  return app;
}

async function call(
  app: express.Express,
  method: "POST" | "DELETE",
  url: string,
  body: unknown = {},
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url,
      headers: { host: "localhost", "content-type": "application/json" },
      body,
    } as unknown as express.Request;
    let statusCode = 200;
    let payload: any = null;
    const res = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(p: any) {
        payload = p;
        resolve({ status: statusCode, body: payload });
        return res;
      },
      setHeader() {
        return res;
      },
      end() {
        if (payload === null) resolve({ status: statusCode, body: null });
      },
      on() {
        return res;
      },
    } as unknown as express.Response;
    try {
      (app as any).handle(req, res, (err: unknown) => {
        if (err) reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

beforeEach(() => {
  fetchStub.mockReset();
  for (const fn of Object.values(dbStubs)) (fn as any).mockReset?.();
  dbStubs.limit.mockResolvedValue([]);
});

describe("buffer connect endpoint", () => {
  it("scaffold loads", () => {
    expect(typeof buildApp).toBe("function");
  });
});
```

- [ ] **Step 1.2: Run the test to confirm it fails on the import**

Run: `npx vitest run tests/unit/bufferConnect.test.ts`
Expected: FAIL with an import error referencing `setupBufferRoutes` not being exported in a way that matches the new shape, or a runtime error from the legacy OAuth handler. (The current `server/routes/buffer.ts` still exports `setupBufferRoutes` so this may actually PASS at this stage — that is fine; the failures arrive in Tasks 2–6.)

- [ ] **Step 1.3: Do not commit yet**

This task only sets up the test harness so subsequent task steps have a working base. We commit at the end of each behavioral task.

---

## Task 2: `POST /api/buffer/connect` — success path

**Files:**
- Modify: `server/routes/buffer.ts`
- Modify: `tests/unit/bufferConnect.test.ts`

- [ ] **Step 2.1: Add the success-path test**

Append inside `describe("buffer connect endpoint", …)` in `tests/unit/bufferConnect.test.ts`:

```ts
  it("POST /api/buffer/connect persists encrypted token when Buffer validates the token", async () => {
    fetchStub.mockResolvedValueOnce({ ok: true, status: 200 } as any);
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/buffer/connect", {
      accessToken: "1/abcdef",
    });
    expect(status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(fetchStub).toHaveBeenCalledWith(
      expect.stringContaining("https://api.bufferapp.com/1/user.json?access_token=1%2Fabcdef"),
      expect.anything(),
    );
    // The .set() chain receives the encrypted token (our stub prefixes with enc:v1:).
    expect(dbStubs.set).toHaveBeenCalledWith({ bufferAccessToken: "enc:v1:1/abcdef" });
  });
```

- [ ] **Step 2.2: Run the test, confirm it fails**

Run: `npx vitest run tests/unit/bufferConnect.test.ts -t "persists encrypted token"`
Expected: FAIL — the route doesn't exist yet, so the request falls through to a 404 or hangs. (`call()` resolves on `res.json()`; a 404 from Express's default handler will not call `res.json()`. If the test times out instead of asserting 200, that's also a valid "fail" — it confirms the route is missing.)

- [ ] **Step 2.3: Rewrite `server/routes/buffer.ts` with the connect route**

Replace the entire contents of `server/routes/buffer.ts` with:

```ts
// Buffer (social publishing) integration routes — bring-your-own-key.
//
// Users generate an access token in Buffer's developer dashboard
// (https://buffer.com/developers/api), paste it into the Connect dialog,
// and we validate + persist it AES-256-GCM encrypted via tokenCipher.
// No platform-owned OAuth app, no client_id / client_secret, no
// callback URL.
//
// Routes:
//   POST   /api/buffer/connect       — validate + persist a user-supplied token
//   GET    /api/buffer/profiles      — list connected social profiles
//   POST   /api/buffer/post          — schedule / publish a post
//   DELETE /api/buffer/connection    — clear the stored token

import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { requireUser } from "../lib/ownership";
import { encryptToken, decryptToken } from "../lib/tokenCipher";
import { sendError } from "../lib/routesShared";

export function setupBufferRoutes(app: Express): void {
  // Validate a user-supplied Buffer access token by calling Buffer's
  // /user.json (cheapest authenticated endpoint). If it succeeds, encrypt
  // and store the token. If Buffer says 401, surface invalid_token so the
  // UI can prompt the user to re-check the token they pasted.
  app.post("/api/buffer/connect", async (req, res) => {
    try {
      const user = requireUser(req);
      const raw = (req.body ?? {}).accessToken;
      const accessToken = typeof raw === "string" ? raw.trim() : "";
      if (!accessToken) {
        return res.status(400).json({ success: false, error: "missing_token" });
      }

      let bufferResp: Response;
      try {
        bufferResp = await fetch(
          `https://api.bufferapp.com/1/user.json?access_token=${encodeURIComponent(accessToken)}`,
        );
      } catch {
        return res.status(502).json({ success: false, error: "buffer_unreachable" });
      }
      if (bufferResp.status === 401) {
        return res.status(400).json({ success: false, error: "invalid_token" });
      }
      if (!bufferResp.ok) {
        return res.status(502).json({ success: false, error: "buffer_unreachable" });
      }

      await db
        .update(users)
        .set({ bufferAccessToken: encryptToken(accessToken) })
        .where(eq(users.id, user.id));
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to connect Buffer");
    }
  });

  // Existing endpoints — unchanged from the OAuth-era implementation,
  // re-pasted here because we are replacing the file wholesale.
  app.get("/api/buffer/profiles", async (req, res) => {
    try {
      const user = requireUser(req);
      const [row] = await db
        .select({ token: users.bufferAccessToken })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      if (!row?.token) {
        return res.status(200).json({ success: true, connected: false, data: [] });
      }
      const accessToken = decryptToken(row.token);
      const resp = await fetch(
        `https://api.bufferapp.com/1/profiles.json?access_token=${encodeURIComponent(accessToken)}`,
      );
      if (!resp.ok) {
        return res.status(502).json({ success: false, error: "Failed to fetch Buffer profiles" });
      }
      const profiles = (await resp.json()) as any[];
      const mapped = Array.isArray(profiles)
        ? profiles.map((p) => ({
            id: p.id,
            service: p.service,
            formattedService: p.formatted_service,
            username: p.formatted_username || p.service_username,
            avatar: p.avatar,
          }))
        : [];
      res.json({ success: true, connected: true, data: mapped });
    } catch (error) {
      sendError(res, error, "Failed to fetch Buffer profiles");
    }
  });

  app.post("/api/buffer/post", async (req, res) => {
    try {
      const user = requireUser(req);
      const { text, profileIds, scheduledAt } = req.body ?? {};
      if (!text || typeof text !== "string") {
        return res.status(400).json({ success: false, error: "text is required" });
      }
      if (!Array.isArray(profileIds) || profileIds.length === 0) {
        return res.status(400).json({ success: false, error: "profileIds is required" });
      }
      const [row] = await db
        .select({ token: users.bufferAccessToken })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      if (!row?.token) {
        return res
          .status(403)
          .json({ success: false, error: "Buffer is not connected. Connect it first." });
      }
      const accessToken = decryptToken(row.token);
      const form = new URLSearchParams();
      form.set("text", text);
      for (const pid of profileIds) form.append("profile_ids[]", String(pid));
      if (scheduledAt) form.set("scheduled_at", new Date(scheduledAt).toISOString());
      form.set("access_token", accessToken);
      const resp = await fetch("https://api.bufferapp.com/1/updates/create.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const data = await resp.json();
      if (!resp.ok || (data as any)?.success === false) {
        return res
          .status(502)
          .json({ success: false, error: (data as any)?.message || "Buffer post failed" });
      }
      res.json({ success: true, data });
    } catch (error) {
      sendError(res, error, "Failed to post to Buffer");
    }
  });

  app.delete("/api/buffer/connection", async (req, res) => {
    try {
      const user = requireUser(req);
      await db.update(users).set({ bufferAccessToken: null }).where(eq(users.id, user.id));
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to disconnect Buffer");
    }
  });
}
```

- [ ] **Step 2.4: Run the test, confirm it passes**

Run: `npx vitest run tests/unit/bufferConnect.test.ts -t "persists encrypted token"`
Expected: PASS.

- [ ] **Step 2.5: Run tsc to confirm no type regressions in the route file**

Run: `npx tsc --noEmit`
Expected: zero errors. (If errors come from unrelated files, leave them; only fail the task on errors mentioning `server/routes/buffer.ts` or `tests/unit/bufferConnect.test.ts`.)

- [ ] **Step 2.6: Commit**

```bash
git add server/routes/buffer.ts tests/unit/bufferConnect.test.ts
git commit -m "feat(buffer): add POST /api/buffer/connect token validate-and-persist"
```

---

## Task 3: `POST /api/buffer/connect` — error paths

**Files:**
- Modify: `tests/unit/bufferConnect.test.ts`

The route's branches for `missing_token`, `invalid_token`, and `buffer_unreachable` are already implemented in Task 2. This task locks them in with tests.

- [ ] **Step 3.1: Add three failure-path tests**

Append inside `describe("buffer connect endpoint", …)`:

```ts
  it("POST /api/buffer/connect returns 400 missing_token for empty body", async () => {
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/buffer/connect", {});
    expect(status).toBe(400);
    expect(body).toEqual({ success: false, error: "missing_token" });
    expect(fetchStub).not.toHaveBeenCalled();
    expect(dbStubs.set).not.toHaveBeenCalled();
  });

  it("POST /api/buffer/connect returns 400 missing_token for whitespace-only token", async () => {
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/buffer/connect", {
      accessToken: "   ",
    });
    expect(status).toBe(400);
    expect(body).toEqual({ success: false, error: "missing_token" });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("POST /api/buffer/connect returns 400 invalid_token when Buffer responds 401", async () => {
    fetchStub.mockResolvedValueOnce({ ok: false, status: 401 } as any);
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/buffer/connect", {
      accessToken: "bad-token",
    });
    expect(status).toBe(400);
    expect(body).toEqual({ success: false, error: "invalid_token" });
    expect(dbStubs.set).not.toHaveBeenCalled();
  });

  it("POST /api/buffer/connect returns 502 buffer_unreachable on Buffer 5xx", async () => {
    fetchStub.mockResolvedValueOnce({ ok: false, status: 503 } as any);
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/buffer/connect", {
      accessToken: "1/whatever",
    });
    expect(status).toBe(502);
    expect(body).toEqual({ success: false, error: "buffer_unreachable" });
    expect(dbStubs.set).not.toHaveBeenCalled();
  });

  it("POST /api/buffer/connect returns 502 buffer_unreachable on network error", async () => {
    fetchStub.mockRejectedValueOnce(new Error("ECONNRESET"));
    const app = buildApp();
    const { status, body } = await call(app, "POST", "/api/buffer/connect", {
      accessToken: "1/whatever",
    });
    expect(status).toBe(502);
    expect(body).toEqual({ success: false, error: "buffer_unreachable" });
    expect(dbStubs.set).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3.2: Run the new tests, confirm all pass**

Run: `npx vitest run tests/unit/bufferConnect.test.ts`
Expected: all `connect endpoint` tests PASS (success path from Task 2 + five new failure paths).

- [ ] **Step 3.3: Commit**

```bash
git add tests/unit/bufferConnect.test.ts
git commit -m "test(buffer): cover connect endpoint error paths"
```

---

## Task 4: `DELETE /api/buffer/connection` — disconnect path

**Files:**
- Modify: `tests/unit/bufferConnect.test.ts`

The handler exists from Task 2. This task locks it in.

- [ ] **Step 4.1: Add the disconnect test**

Append inside `describe("buffer connect endpoint", …)`:

```ts
  it("DELETE /api/buffer/connection clears the stored token", async () => {
    const app = buildApp();
    const { status, body } = await call(app, "DELETE", "/api/buffer/connection");
    expect(status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(dbStubs.set).toHaveBeenCalledWith({ bufferAccessToken: null });
  });
```

- [ ] **Step 4.2: Run the test, confirm it passes**

Run: `npx vitest run tests/unit/bufferConnect.test.ts -t "DELETE /api/buffer/connection"`
Expected: PASS.

- [ ] **Step 4.3: Commit**

```bash
git add tests/unit/bufferConnect.test.ts
git commit -m "test(buffer): cover disconnect endpoint"
```

---

## Task 5: Drop Buffer OAuth env vars from validation

**Files:**
- Modify: `server/env.ts`

The OAuth env vars are validated in `envSchema` and tied to `BUFFER_ENCRYPTION_KEY` via a `refine()` block. Encryption is still required (we still encrypt user-supplied tokens), so `BUFFER_ENCRYPTION_KEY` becomes unconditionally required for the Buffer feature; we remove the OAuth fields and the cross-field refine.

- [ ] **Step 5.1: Edit `server/env.ts`**

Replace the block that currently spans lines around the Buffer fields. Old:

```ts
    // AES-256-GCM key for encrypting third-party access tokens at rest
    // (currently: Buffer OAuth token in users.buffer_access_token).
    // Generate with `openssl rand -base64 32` (must decode to 32 bytes).
    // Required when BUFFER_CLIENT_ID is set; otherwise unused. Validated
    // by the refine() below.
    BUFFER_ENCRYPTION_KEY: z.string().optional(),

    BUFFER_CLIENT_ID: z.string().optional(),
    BUFFER_CLIENT_SECRET: z.string().optional(),
    BUFFER_REDIRECT_URI: z.string().url().optional(),
  })
  .refine(
    (env) => {
      // If Buffer integration is enabled, require an encryption key — else
      // we'd silently store new OAuth tokens in plaintext.
      if (env.BUFFER_CLIENT_ID && !env.BUFFER_ENCRYPTION_KEY) return false;
      return true;
    },
    {
      message:
        "BUFFER_ENCRYPTION_KEY is required when BUFFER_CLIENT_ID is set. " +
        "Generate one with `openssl rand -base64 32`.",
      path: ["BUFFER_ENCRYPTION_KEY"],
    },
  );
```

New:

```ts
    // AES-256-GCM key for encrypting user-supplied Buffer access tokens
    // at rest (users.buffer_access_token). Generate with
    // `openssl rand -base64 32` (must decode to 32 bytes). Optional —
    // tokenCipher only loads it lazily, so deployments that don't use the
    // Buffer feature don't need to set it.
    BUFFER_ENCRYPTION_KEY: z.string().optional(),
  });
```

Note: the closing `})` becomes `});` because we removed the trailing `.refine(...)`.

- [ ] **Step 5.2: Run tsc to confirm the schema still types correctly**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5.3: Run the full test suite to confirm nothing broke**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5.4: Commit**

```bash
git add server/env.ts
git commit -m "chore(buffer): drop OAuth env vars from validation schema"
```

---

## Task 6: Strip Buffer OAuth env vars from `.env.example` and docs

**Files:**
- Modify: `.env.example`
- Modify: `docs/feature_flows.md`

- [ ] **Step 6.1: Edit `.env.example`**

Find the block:

```
# ─── Buffer Social Publishing ────────────────────────────────────
# Create an app at https://buffer.com/developers/apps
BUFFER_CLIENT_ID=
BUFFER_CLIENT_SECRET=
BUFFER_REDIRECT_URI=http://localhost:5000/api/auth/buffer/callback
# Required when BUFFER_CLIENT_ID is set. Encrypts the OAuth access token
# at rest in the database (AES-256-GCM). Generate with:
#   openssl rand -base64 32
# Rotating this key invalidates every stored Buffer token (users will
# need to re-connect Buffer). NEVER commit a real value.
BUFFER_ENCRYPTION_KEY=
```

Replace with:

```
# ─── Buffer Social Publishing ────────────────────────────────────
# Users supply their own Buffer access token via the in-app Connect
# dialog (https://buffer.com/developers/api). The server stores those
# tokens AES-256-GCM encrypted at rest using BUFFER_ENCRYPTION_KEY.
# Generate the key with:
#   openssl rand -base64 32
# Rotating this key invalidates every stored Buffer token (users will
# need to re-connect Buffer). NEVER commit a real value.
BUFFER_ENCRYPTION_KEY=
```

- [ ] **Step 6.2: Edit `docs/feature_flows.md` line ~2712 (the env-var table row)**

Find:

```
| `BUFFER_CLIENT_ID` / `BUFFER_CLIENT_SECRET` / `BUFFER_REDIRECT_URI` | Content distribution → Buffer publishing | Optional — Distribute works without Buffer; just no "Post to Buffer" button |
```

Replace with:

```
| `BUFFER_ENCRYPTION_KEY` | Content distribution → Buffer publishing | Required when users connect Buffer — encrypts their pasted access tokens at rest. Distribute works without Buffer set up; users just won't see the "Post to Buffer" option. |
```

- [ ] **Step 6.3: Edit `docs/feature_flows.md` around line ~3348 (the OAuth URL example)**

Locate the section that documents the OAuth start URL (around `client_id=${BUFFER_CLIENT_ID}`). Read 30 lines around that location to identify the surrounding paragraph, then delete the entire OAuth-flow paragraph and replace it with a one-paragraph description of the BYOK flow:

```
Users obtain an access token from Buffer's developer dashboard
(https://buffer.com/developers/api) and paste it into the Connect
dialog in the Distribute panel. The server validates the token by
calling Buffer's `/user.json` endpoint, then stores it encrypted
(AES-256-GCM via `server/lib/tokenCipher.ts`) on the user row.
Subsequent profile lookups and post submissions decrypt the token
just-in-time. There is no platform-owned OAuth app and no callback
route.
```

If the surrounding paragraph spans more than the OAuth URL example, delete only the lines that explain the OAuth handshake — keep any unrelated content.

- [ ] **Step 6.4: Verify no stale references remain**

Run: `grep -rn "BUFFER_CLIENT_ID\|BUFFER_CLIENT_SECRET\|BUFFER_REDIRECT_URI\|/api/auth/buffer" .env.example docs/ server/ client/ tests/ 2>/dev/null`

Expected output: empty (no matches). Any remaining match needs to be cleaned up before committing.

- [ ] **Step 6.5: Commit**

```bash
git add .env.example docs/feature_flows.md
git commit -m "docs(buffer): replace OAuth env vars with BYOK in .env.example and feature_flows"
```

---

## Task 7: Client — `BufferConnectDialog` component

**Files:**
- Create: `client/src/components/articles/BufferConnectDialog.tsx`

- [ ] **Step 7.1: Create the dialog component**

Write `client/src/components/articles/BufferConnectDialog.tsx`:

```tsx
// Buffer connect dialog — bring-your-own-key.
//
// Renders one of two states based on `connected`:
//   • Disconnected: the Connect button opens a dialog with a masked
//     input for the user's Buffer access token. Submit posts to
//     /api/buffer/connect; on success we close the dialog, invalidate
//     the /profiles query (so the parent picker repopulates), and
//     toast. On 400 invalid_token / missing_token we render an inline
//     error under the input. On 502 we show "Couldn't reach Buffer."
//   • Connected: the Disconnect button hits DELETE /api/buffer/connection
//     and invalidates /profiles. No confirmation modal — disconnecting
//     is reversible by reconnecting with the same (or a fresh) token.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface BufferConnectDialogProps {
  connected: boolean;
}

export default function BufferConnectDialog({ connected }: BufferConnectDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const connectMutation = useMutation({
    mutationFn: async (accessToken: string) => {
      const response = await apiRequest("POST", "/api/buffer/connect", { accessToken });
      const json = await response.json();
      return { status: response.status, body: json };
    },
    onSuccess: ({ status, body }) => {
      if (status === 200 && body?.success) {
        setOpen(false);
        setToken("");
        setError(null);
        queryClient.invalidateQueries({ queryKey: ["/api/buffer/profiles"] });
        toast({ title: "Buffer connected" });
        return;
      }
      if (body?.error === "missing_token") {
        setError("Token is required.");
      } else if (body?.error === "invalid_token") {
        setError("That token didn't work. Double-check it in Buffer's dashboard.");
      } else if (body?.error === "buffer_unreachable") {
        setError("Couldn't reach Buffer. Try again.");
      } else {
        setError("Connection failed. Try again.");
      }
    },
    onError: () => setError("Couldn't reach the server. Try again."),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/buffer/connection");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buffer/profiles"] });
      toast({ title: "Buffer disconnected" });
    },
  });

  if (connected) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => disconnectMutation.mutate()}
        disabled={disconnectMutation.isPending}
        data-testid="button-disconnect-buffer"
      >
        {disconnectMutation.isPending ? (
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        ) : null}
        Disconnect Buffer
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setToken("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-connect-buffer">
          Connect Buffer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Buffer</DialogTitle>
          <DialogDescription>
            Generate an access token in Buffer's developer dashboard, then paste it
            below. We store it encrypted and use it only to publish on your behalf.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <a
            href="https://buffer.com/developers/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            Where do I get this?
          </a>
          <Input
            type="password"
            placeholder="Paste your Buffer access token"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              if (error) setError(null);
            }}
            data-testid="input-buffer-token"
          />
          {error && (
            <p className="text-sm text-red-600" data-testid="text-buffer-connect-error">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => connectMutation.mutate(token.trim())}
            disabled={connectMutation.isPending || !token.trim()}
            data-testid="button-submit-buffer-token"
          >
            {connectMutation.isPending ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : null}
            Connect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7.2: Run tsc to confirm the new component types check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 7.3: Commit**

```bash
git add client/src/components/articles/BufferConnectDialog.tsx
git commit -m "feat(buffer): add BufferConnectDialog client component"
```

---

## Task 8: Wire `BufferConnectDialog` into `DistributeDialog`

**Files:**
- Modify: `client/src/components/articles/DistributeDialog.tsx`

- [ ] **Step 8.1: Add the import**

Open `client/src/components/articles/DistributeDialog.tsx`. After the existing component imports near the top of the file, add:

```ts
import BufferConnectDialog from "./BufferConnectDialog";
```

- [ ] **Step 8.2: Replace the OAuth banner**

Find the block that renders the connect banner (currently the only place in `DistributeDialog.tsx` referencing `/api/auth/buffer`):

```tsx
        {!bufferConnected && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Link2 className="w-4 h-4 text-blue-600" />
              <span className="text-foreground">Connect Buffer to post directly</span>
            </div>
            <Button asChild variant="outline" size="sm" data-testid="button-connect-buffer">
              <a href="/api/auth/buffer">Connect Buffer</a>
            </Button>
          </div>
        )}
```

Replace with:

```tsx
        {!bufferConnected && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Link2 className="w-4 h-4 text-blue-600" />
              <span className="text-foreground">Connect Buffer to post directly</span>
            </div>
            <BufferConnectDialog connected={false} />
          </div>
        )}
```

We do not surface a `Disconnect` affordance here — disconnecting Buffer is rare and surfacing it inside the per-article distribute dialog is noisy. Users who want to disconnect can do so from a future global Buffer settings page (out of scope) or by re-pasting a fresh token to overwrite the stored one. If the user later requests a Disconnect button here, it's a one-line addition (`<BufferConnectDialog connected />` rendered conditionally).

- [ ] **Step 8.3: Run tsc**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 8.4: Verify the only `Button` import is still needed**

Run: `grep -c "<Button" client/src/components/articles/DistributeDialog.tsx`
Expected: a number > 0 (Button is still used elsewhere in the file). If the count is 0, remove the now-unused `Button` import.

- [ ] **Step 8.5: Commit**

```bash
git add client/src/components/articles/DistributeDialog.tsx
git commit -m "feat(buffer): wire BufferConnectDialog into DistributeDialog"
```

---

## Task 9: Final verification gate

**Files:** none (verification only).

- [ ] **Step 9.1: tsc**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 9.2: lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 9.3: tests**

Run: `npm test`
Expected: all green, including the five new tests in `tests/unit/bufferConnect.test.ts`.

- [ ] **Step 9.4: Build the Vercel bundle to confirm the new route file bundles cleanly**

Run: `npm run build`
Expected: the build completes; `api/_bundle.js` is regenerated.

- [ ] **Step 9.5: Manual smoke (developer machine)**

Spin up `npm run dev`. In the Distribute dialog of any article:

1. Confirm "Connect Buffer" opens the new dialog (not a 302 to bufferapp.com).
2. Paste an obviously-bad token (`xxx`). Confirm inline error: "That token didn't work. Double-check it in Buffer's dashboard."
3. Generate a real Buffer access token at https://buffer.com/developers/api, paste it, click Connect.
4. Confirm the dialog closes, the toast appears, and the profile picker populates.
5. Send a test post to one of the listed profiles. Confirm it lands in your Buffer queue.
6. (Optional) `curl -X DELETE http://localhost:5000/api/buffer/connection -H "Authorization: Bearer <jwt>"` — confirm subsequent `/profiles` returns `connected: false`.

- [ ] **Step 9.6: No commit needed**

This task is a sign-off step. Nothing to commit beyond the work already committed in earlier tasks.

---

## Out of scope (do not implement)

- Token rotation reminders or expiry banners.
- A separate "Buffer settings" page outside DistributeDialog.
- A migration shim for users who connected via the deleted OAuth flow. Per spec, those users will reconnect using a manually-generated token; that is acceptable for this rollout.
- Caching the profile list locally. The existing `/profiles` endpoint already fetches on demand; layering a cache is premature.
