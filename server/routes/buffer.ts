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
