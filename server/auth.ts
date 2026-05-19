import type { Express, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { supabaseAdmin } from "./supabase";
import { db } from "./db";
import { users } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { waitUntil } from "@vercel/functions";
import { Sentry } from "./instrument";
import { logger, requestContext } from "./lib/logger";
import { authRateKey } from "./lib/authRateKey";
import { maybeTickActiveRunsForUser } from "./lib/workflowEngine";
import { sendWelcomeEmail } from "./lib/welcomeEmail";

import { captureAndFlush } from "./lib/sentryReport";
// Re-exported for callers that want to use the same keying scheme on
// other endpoints (e.g. account-deletion in Wave 2).
export { authRateKey };

function publicUserShape(dbUser: typeof users.$inferSelect) {
  return {
    id: dbUser.id,
    email: dbUser.email,
    firstName: dbUser.firstName ?? null,
    lastName: dbUser.lastName ?? null,
    timezone: dbUser.timezone ?? null,
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

  // Lazy-eval workflow tick: replaces the global cron (dropped for
  // serverless compat). waitUntil() runs the tick *after* the response
  // is sent (zero added request latency), bounded by the function's
  // maxDuration. Locally @vercel/functions' waitUntil is a no-op shim,
  // so the detached promise just runs in the background. advanceRun is
  // idempotent and the helper debounces.
  const tickPromise = maybeTickActiveRunsForUser(dbUser.id).catch((err) => {
    logger.warn({ err, userId: dbUser.id }, "auth: maybeTickActiveRunsForUser failed");
  });
  waitUntil(tickPromise);

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
  "POST /api/auth/resend-verification",
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
  // Daily cron orchestrator — self-auths via CRON_SECRET (Vercel migration).
  "POST /api/cron/daily-orchestrator",
]);

export const requireAuthForApi: RequestHandler = (req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  const key = `${req.method} ${req.path}`;
  if (PUBLIC_API_ROUTES.has(key)) return next();
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
        logger.warn({ err: error }, "auth: attachUserIfPresent JWT verify failed");
      }
      return next();
    }
    if (!data.user) return next();

    const dbUser = await loadPublicUser(data.user.id);
    if (dbUser) {
      (req as any).user = dbUser;
    }
  } catch (err) {
    logger.warn({ err }, "auth: attachUserIfPresent unexpected error");
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

// Resend verification: 3 per (IP, email) per hour, mirroring the
// forgot-password limit. Each trigger sends a real email, so without a
// limit the endpoint is an inbox-bombing vector. The 60-second min gap
// is enforced separately via the in-memory map below — keeps the UI
// "resend" button from spamming Supabase if a user mashes it.
const resendVerificationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authRateKey,
  message: RATE_LIMIT_MESSAGE,
});

// In-memory map of last-sent timestamps keyed by `${ip}:${email}`. Memory-
// only is fine for the pre-launch single-instance deploy (CLAUDE.md
// confirms single-instance); when we move to multi-instance this needs
// to migrate to Redis along with the other rate-limit buckets.
const resendVerificationLastSentAt = new Map<string, number>();
const RESEND_MIN_GAP_MS = 60_000;
// Plan 4 audit (BUG #6): the per-(IP, email) Map was growing unbounded.
// Evict entries older than 1 hour on every check — at that point the
// express-rate-limit cap (3/hour) has also rolled over so the entry is
// useless. O(n) per call, but bounded by however many requests came in
// in the last hour.
const RESEND_EVICT_AFTER_MS = 60 * 60 * 1000;

function evictStaleResendEntries(now: number): void {
  resendVerificationLastSentAt.forEach((lastSentAt, key) => {
    if (now - lastSentAt > RESEND_EVICT_AFTER_MS) {
      resendVerificationLastSentAt.delete(key);
    }
  });
}

// Test-only: clear the in-memory map between unit tests. Not exported in
// the public API surface — tests import it directly.
export function __resetResendVerificationStateForTests(): void {
  resendVerificationLastSentAt.clear();
}

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

      // Verification link must land back on our app, not Supabase's
      // default Site URL. Mirrors /api/auth/resend-verification.
      const appUrl = process.env.APP_URL || "http://localhost:5000";
      const emailRedirectTo = `${appUrl}/login?verified=1`;

      // admin.createUser is an admin *provisioning* API — it does NOT
      // send the signup confirmation email (only the public signUp() or
      // an explicit resend/generateLink does). So the verification email
      // must be sent explicitly here; without it the user lands on
      // /verify-email waiting for a link that never arrives, can't log
      // in (unconfirmed), and re-registering dead-ends at "already
      // registered". Same mechanism as /api/auth/resend-verification.
      // Best-effort: a failure to send the email must NOT fail the
      // registration (the account exists; the user can still use the
      // manual "Resend" button on /verify-email). So this never throws.
      const sendSignupEmail = async (): Promise<void> => {
        try {
          const result = await supabaseAdmin.auth.resend({
            type: "signup",
            email: normalizedEmail,
            options: { emailRedirectTo },
          });
          const resendErr = (result as { error?: unknown } | undefined)?.error;
          if (resendErr) {
            logger.warn(
              { err: resendErr, email: normalizedEmail },
              "auth: register signup-email send failed",
            );
          }
        } catch (err) {
          logger.warn({ err, email: normalizedEmail }, "auth: register signup-email send threw");
        }
      };

      // Plan 4 Task 3: require email verification before the account can
      // be used. No session is issued in this response — the client
      // routes to /verify-email and waits for the confirmation link.
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: false,
        user_metadata: { firstName: firstName ?? "", lastName: lastName ?? "" },
      });

      if (createErr || !created.user) {
        const msg = createErr?.message ?? "";
        // Match ONLY the duplicate-email case. Not a bare status===422:
        // Supabase also returns 422 for weak_password etc., and
        // self-healing those would falsely tell the user they
        // registered when no account was created.
        const alreadyExists =
          (createErr as any)?.code === "email_exists" ||
          /already.*regist|already.*exist|user.*already.*regist/i.test(msg);

        // Self-heal the stuck-account dead-end: a prior attempt created
        // the Supabase user but no verification email was ever sent, so
        // the user keeps re-registering and hitting "already
        // registered". Re-send the confirmation and treat it as an
        // idempotent success so the account becomes usable. Supabase
        // no-ops resend for already-verified accounts (the /verify-email
        // screen offers an "Already verified? Sign in" path for that
        // case), and the response is now uniform with a fresh signup so
        // this also closes the previous account-enumeration leak.
        if (alreadyExists) {
          await sendSignupEmail();
          logger.info(
            { email: normalizedEmail },
            "auth: register on existing unverified account — resent verification",
          );
          return res.json({ success: true, requiresVerification: true, email: normalizedEmail });
        }

        // Genuine failure — log it (the old code returned this only to
        // the client and never logged it, so production 400s had no
        // diagnosable reason).
        logger.warn({ err: createErr, email: normalizedEmail }, "auth: register createUser failed");
        return res.status(400).json({
          success: false,
          error: createErr?.message || "Failed to create account",
        });
      }

      await sendSignupEmail();

      res.json({
        success: true,
        requiresVerification: true,
        email: normalizedEmail,
      });
    } catch (error: any) {
      captureAndFlush(error, { tags: { source: "auth.ts:register" } });
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

      // Plan 4 audit (BUG #2): the `auth.users → public.users` mirror
      // trigger in migration 0001 fires on `after insert or update of
      // email` only — NOT on update of `email_confirmed_at`. So after a
      // user clicks the Supabase verification link, our
      // `public.users.email_verified` mirror stays at 0 forever. Sync
      // it here on every successful login: if Supabase reports a
      // confirmed email and our mirror disagrees, flip it. Idempotent
      // and cheap — usually a no-op after the first post-verify login.
      if (data.user.email_confirmed_at && dbUser.emailVerified !== 1) {
        try {
          await db.update(users).set({ emailVerified: 1 }).where(eq(users.id, dbUser.id));
          dbUser.emailVerified = 1;
        } catch (err) {
          logger.warn({ err, userId: dbUser.id }, "auth: failed to sync emailVerified mirror");
        }
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

      // Welcome email: fires exactly once on the user's first successful
      // login. Plan 4 audit (BUG #13) introduced `welcomedAt` as the
      // dedicated gate — NULL means "welcome email not yet sent".
      // Existing rows backfilled to NOW() in migration 0056 so we don't
      // spam pre-existing accounts.
      //
      // Plan 4 audit (BUG #1): two concurrent logins from the same user
      // (double-click, two tabs) could both observe welcomedAt === null
      // and both fire the email. The atomic conditional UPDATE below
      // returns the row only when this request actually flipped the
      // column from NULL — i.e. won the race. The loser sees zero rows
      // returned and skips the dispatch.
      const now = new Date();
      let wonFirstLoginRace = false;
      try {
        const updated = await db
          .update(users)
          .set({ welcomedAt: now, lastLoginAt: now })
          .where(and(eq(users.id, dbUser.id), isNull(users.welcomedAt)))
          .returning({ id: users.id });
        wonFirstLoginRace = updated.length > 0;
      } catch (err) {
        logger.warn({ err, userId: dbUser.id }, "auth: failed to stamp welcomedAt");
      }

      if (!wonFirstLoginRace) {
        // Regular case (subsequent login or race loser): still update
        // lastLoginAt so it tracks the literal "last login time".
        try {
          await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, dbUser.id));
        } catch (err) {
          logger.warn({ err, userId: dbUser.id }, "auth: failed to stamp lastLoginAt");
        }
      }

      if (wonFirstLoginRace) {
        const recipientEmail = dbUser.email;
        const recipientFirstName = dbUser.firstName;
        if (recipientEmail) {
          // Plan 4 audit (BUG #27): setImmediate is unreliable on Vercel
          // serverless — the function can suspend immediately after
          // res.json() and drop the queued work. waitUntil keeps the
          // function alive past the response. Locally it's a no-op
          // shim so the promise just runs in the background.
          // Plan 4 audit (BUG #10): also tag Sentry on failure so a
          // dropped welcome email actually pages someone.
          waitUntil(
            sendWelcomeEmail(recipientEmail, recipientFirstName).catch((err) => {
              logger.warn({ err, userId: dbUser.id }, "auth: welcome email dispatch failed");
              captureAndFlush(err, { tags: { source: "welcome-email" } });
            }),
          );
        }
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
        logger.warn({ err: error }, "auth: resetPasswordForEmail failed");
      }

      // Always return success to avoid account enumeration.
      res.json({
        success: true,
        message: "If an account exists with this email, you will receive a password reset link.",
      });
    } catch (err) {
      logger.error({ err }, "auth: forgot password error");
      captureAndFlush(err, { tags: { source: "auth.ts:413" } });
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

  // Resend the email verification link. The register handler triggers
  // Supabase to send the original; if it gets lost or expires, the user
  // hits this endpoint via the "resend" button on the /verify-email
  // screen. We always return success regardless of whether the account
  // exists (anti-enumeration), but we *do* enforce a 60-second minimum
  // gap per (IP, email) and a 3/hour cap (via the rate-limit middleware
  // above) so the endpoint can't be turned into an inbox-bombing tool.
  app.post("/api/auth/resend-verification", resendVerificationRateLimit, async (req, res) => {
    try {
      const { email } = req.body ?? {};
      if (!email || typeof email !== "string") {
        return res.status(400).json({ success: false, error: "Email is required" });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const bucketKey = `${req.ip ?? "unknown"}:${normalizedEmail}`;
      const now = Date.now();
      // Plan 4 audit (BUG #6): evict stale entries on every call so
      // the map stays bounded.
      evictStaleResendEntries(now);
      const lastSent = resendVerificationLastSentAt.get(bucketKey);
      if (lastSent !== undefined && now - lastSent < RESEND_MIN_GAP_MS) {
        return res.status(429).json({
          success: false,
          error: "Please wait a minute before requesting another verification email.",
        });
      }
      resendVerificationLastSentAt.set(bucketKey, now);

      // Plan 4 audit (BUG #12): pass emailRedirectTo so the
      // verification link lands users back on our app at
      // /login?verified=1 instead of the Supabase project's default
      // Site URL.
      const appUrl = process.env.APP_URL || "http://localhost:5000";
      const emailRedirectTo = `${appUrl}/login?verified=1`;

      // Supabase's auth.resend() resends a pending signup confirmation.
      // It silently no-ops for nonexistent accounts (and for accounts
      // that are already verified), which is exactly the
      // non-enumerating behavior we want — we don't have to branch on
      // the result, just log and return success either way.
      const { error } = await supabaseAdmin.auth.resend({
        type: "signup",
        email: normalizedEmail,
        options: { emailRedirectTo },
      });
      if (error) {
        logger.warn({ err: error }, "auth: resend verification failed");
      }

      res.json({
        success: true,
        message:
          "If an account exists with this email and is not yet verified, a new link has been sent.",
      });
    } catch (err) {
      logger.error({ err }, "auth: resend verification error");
      captureAndFlush(err, { tags: { source: "auth.ts:resend-verification" } });
      res.status(500).json({ success: false, error: "Failed to process request" });
    }
  });
}
