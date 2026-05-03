// Buffer (social publishing) integration routes — bring-your-own-key.
//
// Buffer's classic v1 REST API (api.bufferapp.com/1/) was retired in
// favor of a single GraphQL endpoint at https://api.buffer.com. Users
// generate an API key in their account settings
// (https://publish.buffer.com/settings/api), paste it into the Connect
// dialog, and we validate + persist it AES-256-GCM encrypted via
// tokenCipher. No OAuth, no client_id, no callback URL.
//
// Routes:
//   POST   /api/buffer/connect       — validate + persist a user-supplied key
//   GET    /api/buffer/profiles      — list connected channels (formerly profiles)
//   POST   /api/buffer/post          — schedule one post on one channel
//   DELETE /api/buffer/connection    — clear the stored key

import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { requireUser } from "../lib/ownership";
import { encryptToken, decryptToken } from "../lib/tokenCipher";
import { postToBuffer } from "../lib/bufferPost";
import { sendError } from "../lib/routesShared";

const BUFFER_GRAPHQL_ENDPOINT = "https://api.buffer.com";

// One-shot helper around Buffer's GraphQL endpoint. Returns the parsed
// JSON body and the raw Response so callers can branch on status (401 →
// invalid_token) and on `errors[]` (UNAUTHORIZED in the extensions code
// is also a credential failure). Throws on network errors so callers can
// distinguish "Buffer rejected" from "couldn't reach Buffer".
async function bufferGraphQL<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{
  resp: Response;
  body: { data?: T; errors?: Array<{ message: string; extensions?: { code?: string } }> };
}> {
  const resp = await fetch(BUFFER_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
  });
  let body: any;
  try {
    body = await resp.json();
  } catch {
    body = {};
  }
  return { resp, body };
}

// "twitter" → "Twitter", "google_business" → "Google Business". Buffer's
// v1 REST API used to surface a `formatted_service` field; the GraphQL
// API only exposes the lowercase `service` slug, but the existing
// frontend matcher (DistributeDialog) keys off both. Synthesize it.
function formatService(service: string): string {
  if (!service) return "";
  return service
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function setupBufferRoutes(app: Express): void {
  // Validate a user-supplied Buffer API key by issuing a minimal account
  // query against the GraphQL endpoint. A successful response with a
  // non-null `account.id` confirms the key works. 401 or an
  // UNAUTHORIZED extensions code → invalid_token. Network failure or
  // other 5xx → buffer_unreachable.
  app.post("/api/buffer/connect", async (req, res) => {
    try {
      const user = requireUser(req);
      const raw = (req.body ?? {}).accessToken;
      const accessToken = typeof raw === "string" ? raw.trim() : "";
      if (!accessToken) {
        return res.status(400).json({ success: false, error: "missing_token" });
      }

      let result: Awaited<ReturnType<typeof bufferGraphQL<{ account: { id: string } | null }>>>;
      try {
        result = await bufferGraphQL<{ account: { id: string } | null }>(
          accessToken,
          "{ account { id } }",
        );
      } catch {
        return res.status(502).json({ success: false, error: "buffer_unreachable" });
      }
      if (result.resp.status === 401) {
        return res.status(400).json({ success: false, error: "invalid_token" });
      }
      const unauthorizedError = result.body.errors?.find(
        (e) => e.extensions?.code === "UNAUTHORIZED" || e.extensions?.code === "FORBIDDEN",
      );
      if (unauthorizedError) {
        return res.status(400).json({ success: false, error: "invalid_token" });
      }
      if (!result.resp.ok || !result.body.data?.account?.id) {
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

  // Lists connected channels (Buffer's GraphQL successor to "profiles")
  // across every organization the API key can see. The response shape
  // intentionally mirrors the legacy REST mapping (id / service /
  // formattedService / username / avatar) so the existing
  // DistributeDialog matcher keeps working without UI changes.
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

      let orgsResult;
      try {
        orgsResult = await bufferGraphQL<{
          account: { organizations: Array<{ id: string }> } | null;
        }>(accessToken, "{ account { organizations { id } } }");
      } catch {
        return res.status(502).json({ success: false, error: "Failed to fetch Buffer profiles" });
      }
      if (!orgsResult.resp.ok || !orgsResult.body.data?.account) {
        return res.status(502).json({ success: false, error: "Failed to fetch Buffer profiles" });
      }
      const organizations = orgsResult.body.data.account.organizations ?? [];

      const channels: Array<{
        id: string;
        service: string;
        formattedService: string;
        username: string;
        avatar: string | null;
      }> = [];
      for (const org of organizations) {
        let chResult;
        try {
          chResult = await bufferGraphQL<{
            channels: Array<{
              id: string;
              name: string | null;
              service: string;
              avatar: string | null;
            }>;
          }>(
            accessToken,
            `query GetChannels($input: ChannelsInput!) { channels(input: $input) { id name service avatar } }`,
            { input: { organizationId: org.id } },
          );
        } catch {
          continue;
        }
        if (!chResult.resp.ok || !chResult.body.data?.channels) continue;
        for (const ch of chResult.body.data.channels) {
          channels.push({
            id: ch.id,
            service: ch.service,
            formattedService: formatService(ch.service),
            username: ch.name ?? "",
            avatar: ch.avatar ?? null,
          });
        }
      }

      res.json({ success: true, connected: true, data: channels });
    } catch (error) {
      sendError(res, error, "Failed to fetch Buffer profiles");
    }
  });

  // Schedule one post on one channel. The legacy REST API took
  // `profile_ids[]` and fanned out server-side; Buffer's GraphQL
  // `createPost` mutation is per-channel, so callers post once per
  // channel. `scheduledAt` (ISO 8601) → `mode: customScheduled` with a
  // `dueAt`; omit it for `mode: addToQueue`.
  app.post("/api/buffer/post", async (req, res) => {
    try {
      const user = requireUser(req);
      const { text, channelId, scheduledAt } = req.body ?? {};
      if (!text || typeof text !== "string") {
        return res.status(400).json({ success: false, error: "text is required" });
      }
      if (!channelId || typeof channelId !== "string") {
        return res.status(400).json({ success: false, error: "channelId is required" });
      }
      const result = await postToBuffer(user.id, channelId, text, scheduledAt);
      if (result.ok) {
        return res.json({ success: true, data: { postId: result.postId } });
      }
      if (result.code === "not_connected") {
        return res
          .status(403)
          .json({ success: false, error: "Buffer is not connected. Connect it first." });
      }
      if (result.code === "rejected") {
        return res
          .status(502)
          .json({ success: false, error: result.message ?? "Buffer post failed" });
      }
      return res.status(502).json({ success: false, error: "Buffer post failed" });
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
