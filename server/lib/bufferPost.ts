// Shared Buffer-posting helper. Both POST /api/buffer/post (manual,
// arbitrary text) and POST /api/distributions/:id/buffer-post
// (per-card, generated copy) call this. Centralizes the GraphQL
// `createPost` mutation, error mapping, and token decryption so the two
// callers stay consistent.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { decryptToken } from "./tokenCipher";
import { logger } from "./logger";

const BUFFER_GRAPHQL_ENDPOINT = "https://api.buffer.com";

export type BufferPostResult =
  | { ok: true; postId: string }
  | { ok: false; code: "not_connected" | "rejected" | "unreachable"; message?: string };

export async function postToBuffer(
  userId: string,
  channelId: string,
  text: string,
  scheduledAt?: string,
): Promise<BufferPostResult> {
  const [row] = await db
    .select({ token: users.bufferAccessToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row?.token) {
    return { ok: false, code: "not_connected" };
  }
  const accessToken = decryptToken(row.token);

  // Default to `mode: addToQueue`: Buffer drops the post into the
  // next available slot in the user's per-channel posting schedule
  // (configured in Buffer's web app at /account/posting-schedule).
  // We do NOT pick the time — that's the entire point of queue mode.
  // If the user has no schedule for the channel, the post will sit in
  // their queue until they configure one. Callers can pass `scheduledAt`
  // to override with a specific time (`mode: customScheduled`).
  const variables: Record<string, unknown> = {
    input: {
      channelId,
      text,
      schedulingType: "automatic",
      ...(scheduledAt
        ? { mode: "customScheduled", dueAt: new Date(scheduledAt).toISOString() }
        : { mode: "addToQueue" }),
    },
  };
  const mutation = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess { post { id text dueAt } }
        ... on MutationError { message }
      }
    }
  `;

  let resp: Response;
  try {
    resp = await fetch(BUFFER_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: mutation, variables }),
    });
  } catch {
    return { ok: false, code: "unreachable" };
  }

  let body: {
    data?: {
      createPost?:
        | { post: { id: string; text: string; dueAt: string | null } }
        | { message: string };
    };
    errors?: Array<{ message: string; extensions?: { code?: string } }>;
  };
  try {
    body = await resp.json();
  } catch {
    return { ok: false, code: "unreachable" };
  }

  // Top-level GraphQL `errors[]` means Buffer reached us, parsed the
  // request, and rejected it (validation, auth, or schema mismatch).
  // Surface the upstream message instead of pretending the network was
  // unreachable — the user can act on "mode 'now' not allowed" or
  // "Variable $input got invalid value" but not on a generic 502.
  if (body.errors?.[0]) {
    const message = body.errors.map((e) => e.message).join("; ");
    logger.warn(
      {
        userId,
        channelId,
        textLength: text.length,
        status: resp.status,
        upstreamErrors: body.errors,
      },
      "buffer.createPost: upstream returned GraphQL errors",
    );
    return { ok: false, code: "rejected", message };
  }
  if (!resp.ok) {
    logger.warn(
      { userId, channelId, status: resp.status, body },
      "buffer.createPost: non-2xx with no errors[]",
    );
    return { ok: false, code: "unreachable" };
  }

  const payload = body.data?.createPost;
  if (!payload) {
    logger.warn({ userId, channelId, body }, "buffer.createPost: 200 OK but no createPost payload");
    return { ok: false, code: "unreachable" };
  }
  if ("message" in payload) {
    return { ok: false, code: "rejected", message: payload.message };
  }
  return { ok: true, postId: payload.post.id };
}
