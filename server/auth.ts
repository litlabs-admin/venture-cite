import type { Express, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { supabaseAdmin } from "./supabase";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { Sentry } from "./instrument";
import { logger, requestContext } from "./lib/logger";
import { authRateKey } from "./lib/authRateKey";

// Re-exported for callers that want to use the same keying scheme on
// other endpoints (e.g. account-deletion in Wave 2).
export { authRateKey };

function publicUserShape(dbUser: typeof users.$inferSelect) {
  return {
    id: dbUser.id,
    email: dbUser.email,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    accessTier: dbUser.accessTier,
    profileImageUrl: dbUser.profileImageUrl,
    isAdmin: dbUser.isAdmin === 1,
  };
}

async function loadPublicUser(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if ((req as any).user) return next();
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }
  const token = header.slice(7);

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    if (error && error.message && !/invalid jwt/i.test(error.message)) {
      logger.warn({ err: error }, "auth: JWT verify failed");
    }
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  const dbUser = await loadPublicUser(data.user.id);
  if (!dbUser) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  // Account is in the post-delete grace window. Block all authenticated
  // requests so the user can't keep operating while their data is queued
  // for purge. The dedicated `account_deleted` error code lets the
  // frontend show a recovery page instead of a generic auth-failure.
  if (dbUser.deletedAt) {
    return res.status(401).json({
      success: false,
      error: "Account scheduled for deletion. Contact support to restore.",
      code: "account_deleted",
    });
  }

  (req as any).user = dbUser;

  // Push the user ID into the per-request context so every subsequent log
  // line and Sentry event in this request is automatically tagged.
  const ctx = requestContext.getStore();
  if (ctx) ctx.userId = dbUser.id;
  Sentry.setUser({ id: dbUser.id });

  next();
};

// Assert that `brandId` belongs to the current user, or respond 404.
// Returns `true` when the check passed (or was skipped — no brandId), and
// `false` when the response has already been sent.
async function checkBrandOwnership(
  brandId: unknown,
  userId: string,
  res: import("express").Response,
): Promise<boolean> {
  if (!brandId || typeof brandId !== "string") return true;
  const { db } = await import("./db");
  const schema = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");
  const rows = await db
    .select({ id: schema.brands.id })
    .from(schema.brands)
    .where(and(eq(schema.brands.id, brandId), eq(schema.brands.userId, userId)))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ success: false, error: "Brand not found" });
    return false;
  }
  return true;
}

// Global guard that checks body/query brandId values.
// URL-path `:brandId` params are handled separately via `app.param` in
// routes.ts, because `req.params` is empty at this middleware layer (Express
// only populates it after a route is matched).
export const enforceBrandOwnership: RequestHandler = async (req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  const user = (req as any).user;
  if (!user) return next();

  const candidate =
    (req.query as any)?.brandId ??
    (req.body && typeof req.body === "object" ? (req.body as any).brandId : undefined);

  const ok = await checkBrandOwnership(candidate, user.id, res);
  if (ok) next();
};

// Express param handler: fires whenever a route template contains `:brandId`
// and Express matches it. This is where URL-path brandIds are authorized.
// Wire via `app.param("brandId", brandIdParamHandler)` in routes.ts.
export const brandIdParamHandler: import("express").RequestParamHandler = async (
  req,
  res,
  next,
  brandId,
) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }
  const ok = await checkBrandOwnership(brandId, user.id, res);
  if (ok) next();
};

export const isAdmin: RequestHandler = (req, res, next) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ success: false, error: "Not authenticated" });
  if (user.isAdmin !== 1) return res.status(403).json({ success: false, error: "Admin only" });
  next();
};

// Public routes that bypass the global isAuthenticated guard.
// Everything else under /api/* requires a valid Bearer token.
const PUBLIC_API_ROUTES = new Set<string>([
  "POST /api/auth/register",
  "POST /api/auth/login",
  "POST /api/auth/logout",
  "POST /api/auth/forgot-password",
  "POST /api/auth/reset-password",
  "POST /api/waitlist",
  "POST /api/stripe/webhook",
  // Resend bounce/complaint webhook — signed via Svix, registered in
  // server/index.ts with raw body parser.
  "POST /api/webhooks/resend",
  // Unsubscribe is HMAC-token-authenticated (not session); mail clients
  // POST here without any cookie/bearer per RFC 8058.
  "POST /api/unsubscribe",
  "GET /api/unsubscribe",
  // Image proxy — loaded by <img> tags, which can't send bearer tokens.
  // Endpoint itself is hardened (SSRF-safe, image-only responses).
  "GET /api/logo-proxy",
]);

// Routes whose handlers do their own auth (e.g. SSE endpoints which can't
// send Authorization headers from EventSource and instead validate a token
// from the query string). The handler MUST do the verify itself — we just
// skip the global Bearer guard.
const SELF_AUTHED_PREFIXES: Array<{ method: string; prefix: string; suffix: string }> = [
  // GET /api/content-jobs/<id>/stream
  { method: "GET", prefix: "/api/content-jobs/", suffix: "/stream" },
];

function isSelfAuthed(method: string, path: string): boolean {
  for (const r of SELF_AUTHED_PREFIXES) {
    if (method === r.method && path.startsWith(r.prefix) && path.endsWith(r.suffix)) {
      // Make sure there's something between prefix and suffix (the id).
      const idLen = path.length - r.prefix.length - r.suffix.length;
      if (idLen > 0) return true;
    }
  }
  return false;
}

export const requireAuthForApi: RequestHandler = (req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  const key = `${req.method} ${req.path}`;
  if (PUBLIC_API_ROUTES.has(key)) return next();
  if (isSelfAuthed(req.method, req.path)) return next();
  return isAuthenticated(req, res, next);
};

// Populates req.user if a valid Bearer token is present; otherwise silently
// continues. Used as a global middleware — the real gatekeeper is
// requireAuthForApi below, which enforces auth on every non-public /api/*.
export const attachUserIfPresent: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next();
  }
  const token = header.slice(7);

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error) {
      if (error.message && !/invalid jwt/i.test(error.message)) {
        console.warn("[auth] JWT verify failed:", error.message);
      }
      return next();
    }
    if (!data.user) return next();

    const dbUser = await loadPublicUser(data.user.id);
    if (dbUser) {
      (req as any).user = dbUser;
    }
  } catch (err: any) {
    console.warn("[auth] attachUserIfPresent unexpected error:", err?.message || err);
  }
  next();
};

const RATE_LIMIT_MESSAGE = {
  success: false,
  error: "Too many attempts. Please wait a few minutes and try again.",
};

// Login: 10 attempts per (IP, email) per 15 minutes. Generous enough for
// honest typo-prone users; costly enough that credential stuffing against
// a single account is impractical.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authRateKey,
  message: RATE_LIMIT_MESSAGE,
});

// Register: 5 per IP per hour. Slows mass-signup abuse without
// blocking a busy office or hackathon.
const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${req.ip ?? "unknown"}`,
  message: RATE_LIMIT_MESSAGE,
});

// Forgot password: 3 per (IP, email) per hour. The endpoint always
// returns the same response regardless of account existence (anti-
// enumeration), but each successful trigger sends a real email — so
// without a limit the endpoint is an inbox-bombing vector for any
// attacker who can guess valid email addresses.
const forgotPasswordRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authRateKey,
  message: RATE_LIMIT_MESSAGE,
});

// Reset password: defunct (returns 410) but still rate-limited as
// belt-and-braces against probe traffic.
const resetPasswordRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${req.ip ?? "unknown"}`,
  message: RATE_LIMIT_MESSAGE,
});

export function setupAuth(app: Express) {
  app.post("/api/auth/register", registerRateLimit, async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body ?? {};

      if (!email || !password) {
        return res.status(400).json({ success: false, error: "Email and password are required" });
      }
      if (typeof password !== "string" || password.length < 8) {
        return res
          .status(400)
          .json({ success: false, error: "Password must be at least 8 characters" });
      }

      const normalizedEmail = String(email).toLowerCase().trim();

      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { firstName: firstName ?? "", lastName: lastName ?? "" },
      });

      if (createErr || !created.user) {
        return res.status(400).json({
          success: false,
          error: createErr?.message || "Failed to create account",
        });
      }

      // Trigger in Supabase mirrors auth.users → public.users. Issue a session
      // immediately so the client can log in without a second round-trip.
      const { data: session, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInErr || !session.session) {
        return res.status(500).json({
          success: false,
          error: "Account created but session could not be issued. Please log in.",
        });
      }

      const dbUser = await loadPublicUser(created.user.id);
      if (!dbUser) {
        return res.status(500).json({
          success: false,
          error: "Account created but user profile not synced. Please try logging in.",
        });
      }

      res.json({
        success: true,
        user: publicUserShape(dbUser),
        access_token: session.session.access_token,
        refresh_token: session.session.refresh_token,
        expires_at: session.session.expires_at,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "Registration failed" });
    }
  });

  app.post("/api/auth/login", loginRateLimit, async (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      if (!email || !password) {
        return res.status(400).json({ success: false, error: "Email and password are required" });
      }

      const { data, error } = await supabaseAdmin.auth.signInWithPassword({
        email: String(email).toLowerCase().trim(),
        password: String(password),
      });

      if (error || !data.session || !data.user) {
        return res.status(401).json({ success: false, error: "Invalid email or password" });
      }

      const dbUser = await loadPublicUser(data.user.id);
      if (!dbUser) {
        return res.status(401).json({ success: false, error: "User profile not found" });
      }

      // Refuse logins for accounts in the post-delete grace window.
      // Returning a fresh session would let the user keep operating while
      // their data is queued for purge.
      if (dbUser.deletedAt) {
        return res.status(401).json({
          success: false,
          error: "Account scheduled for deletion. Contact support to restore.",
          code: "account_deleted",
        });
      }

      res.json({
        success: true,
        user: publicUserShape(dbUser),
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      });
    } catch (error: any) {
      res.status(401).json({ success: false, error: error.message || "Login failed" });
    }
  });

  app.post("/api/auth/logout", (_req, res) => {
    // JWTs are stateless; the client discards its tokens.
    res.json({ success: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }
    res.json({ success: true, user: publicUserShape(user) });
  });

  app.post("/api/auth/forgot-password", forgotPasswordRateLimit, async (req, res) => {
    try {
      const { email } = req.body ?? {};
      if (!email) {
        return res.status(400).json({ success: false, error: "Email is required" });
      }

      const appUrl = process.env.APP_URL || "http://localhost:5000";
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(
        String(email).toLowerCase().trim(),
        { redirectTo: `${appUrl}/reset-password` },
      );

      if (error) {
        console.error("[Auth] resetPasswordForEmail failed:", error.message);
      }

      // Always return success to avoid account enumeration.
      res.json({
        success: true,
        message: "If an account exists with this email, you will receive a password reset link.",
      });
    } catch (error: any) {
      console.error("Forgot password error:", error);
      res.status(500).json({ success: false, error: "Failed to process request" });
    }
  });

  // Password reset is completed client-side. After the user clicks the magic
  // link, Supabase places a session in the browser and the client calls
  // supabase.auth.updateUser({ password }). This endpoint remains for
  // backward compatibility with any code that POSTs to it directly.
  app.post("/api/auth/reset-password", resetPasswordRateLimit, async (_req, res) => {
    res.status(410).json({
      success: false,
      error: "Password reset is now handled in the browser via Supabase magic link.",
    });
  });
}
