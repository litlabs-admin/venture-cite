// Buffer (social publishing) integration routes (Wave 5.1).
//
// OAuth callback persists the access token AES-encrypted (see
// server/lib/tokenCipher.ts); the profiles + post endpoints decrypt
// it just-in-time for the upstream Buffer API call.
//
// Routes:
//   GET    /api/auth/buffer            — start OAuth (302 to Buffer)
//   GET    /api/auth/buffer/callback   — OAuth callback, persists token
//   GET    /api/buffer/profiles        — list connected social profiles
//   POST   /api/buffer/post            — schedule / publish a post
//   DELETE /api/auth/buffer            — disconnect (clears token)

import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { requireUser } from "../lib/ownership";
import { encryptToken, decryptToken } from "../lib/tokenCipher";
import { sendError } from "../lib/routesShared";

export function setupBufferRoutes(app: Express): void {
  app.get("/api/auth/buffer", async (req, res) => {
    const clientId = process.env.BUFFER_CLIENT_ID;
    const redirectUri =
      process.env.BUFFER_REDIRECT_URI || `${process.env.APP_URL || ""}/api/auth/buffer/callback`;
    if (!clientId) {
      return res
        .status(503)
        .json({ success: false, error: "Buffer integration is not configured. Contact support." });
    }
    const authUrl = `https://bufferapp.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
    res.redirect(authUrl);
  });

  app.get("/api/auth/buffer/callback", async (req, res) => {
    try {
      const user = requireUser(req);
      const { code } = req.query;
      if (!code || typeof code !== "string") {
        return res.status(400).send("Missing authorization code");
      }
      const clientId = process.env.BUFFER_CLIENT_ID;
      const clientSecret = process.env.BUFFER_CLIENT_SECRET;
      const redirectUri =
        process.env.BUFFER_REDIRECT_URI || `${process.env.APP_URL || ""}/api/auth/buffer/callback`;
      if (!clientId || !clientSecret) {
        return res.status(503).send("Buffer integration is not configured");
      }

      const tokenResp = await fetch("https://api.bufferapp.com/1/oauth2/token.json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
          grant_type: "authorization_code",
        }).toString(),
      });

      if (!tokenResp.ok) {
        return res.status(502).send("Failed to exchange Buffer authorization code");
      }
      const tokenData = (await tokenResp.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        return res.status(502).send("Buffer did not return an access token");
      }

      // Encrypt the OAuth token before persisting. A DB breach must not
      // expose live Buffer credentials capable of posting / deleting on
      // user social accounts.
      await db
        .update(users)
        .set({ bufferAccessToken: encryptToken(tokenData.access_token) })
        .where(eq(users.id, user.id));

      const appUrl = process.env.APP_URL || "";
      res.redirect(`${appUrl}/articles?buffer=connected`);
    } catch (error) {
      sendError(res, error, "Buffer OAuth failed");
    }
  });

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

  app.delete("/api/auth/buffer", async (req, res) => {
    try {
      const user = requireUser(req);
      await db.update(users).set({ bufferAccessToken: null }).where(eq(users.id, user.id));
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to disconnect Buffer");
    }
  });
}
