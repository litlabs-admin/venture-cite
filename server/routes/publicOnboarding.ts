// Anonymous onboarding session routes. Runs before sign-up, so nothing here
// requires a Bearer token - server/auth.ts's PUBLIC_API_PREFIXES already
// lets `/api/public/onboarding/` through requireAuthForApi. Every route below
// validates its own input, since that guard is the only thing standing
// between this prefix and the rest of the app.
// Spec: docs/superpowers/specs/2026-09-18-onboarding-data-contract.md.
import crypto from "crypto";
import { waitUntil } from "@vercel/functions";
import type { Express, Request } from "express";
import { z } from "zod";
import { logger } from "../lib/logger";
import { asyncHandler } from "../lib/asyncHandler";
import { validateDomain } from "@shared/validateDomain";
import { sessionAnswersSchema } from "@shared/onboarding/session";
import { admitSession, getSession, setAnswers } from "../onboardingSession/store";
import { runSessionPipeline } from "../onboardingSession/pipeline";
import { onboardingIpSalt } from "../onboardingSession/ipSalt";

const SSE_POLL_INTERVAL_MS = 700;
const SSE_HEARTBEAT_MS = 15_000;

const createSessionBodySchema = z.object({ domain: z.string().min(1).max(253) });
const sessionIdSchema = z.string().uuid();

/** Salted SHA-256 of the client IP - never the raw address. Salt: ../onboardingSession/ipSalt. */
function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(`${onboardingIpSalt()}:${ip}`).digest("hex");
}

function clientIp(req: Request): string {
  // Express's req.ip already honors X-Forwarded-For when trust proxy is set
  // (server/index.ts), matching server/lib/audit.ts's extractIp.
  return req.ip ?? "unknown";
}

export function setupPublicOnboardingRoutes(app: Express) {
  app.post(
    "/api/public/onboarding/sessions",
    asyncHandler(async (req, res) => {
      const parsedBody = createSessionBodySchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ success: false, error: "domain is required" });
      }
      const validation = validateDomain(parsedBody.data.domain);
      if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.reason });
      }

      const ipHash = hashIp(clientIp(req));
      const admission = await admitSession({ domain: validation.normalized, ipHash });

      if (admission.kind === "rate_limited") {
        return res.status(429).json({
          success: false,
          error: "Too many onboarding attempts from this network. Try again in an hour.",
        });
      }

      if (admission.kind === "live_session_exists") {
        // Same domain: a double-click or a reload from the same client - hand
        // back the session already running instead of erroring, so the SSE
        // stream the caller opens next resumes it rather than starting over.
        if (admission.domain === validation.normalized) {
          return res.json({ sessionId: admission.sessionId });
        }
        // Different domain: this network is already mid-run for something
        // else. That run must finish (or expire) before a second one starts,
        // so this is a real conflict, not a resumable duplicate.
        return res.status(409).json({
          success: false,
          error:
            "An onboarding session for a different site is already in progress from this network.",
        });
      }

      const session = admission.session;

      // Fire-and-forget: the pipeline streams its results through
      // appendEvent while the response below returns immediately with the
      // session id. waitUntil keeps the background work alive past the
      // response on this runtime, matching how
      // server/services/onboardingActivation.ts drives its own pipeline.
      waitUntil(
        runSessionPipeline(session.id, validation.normalized).catch((err) => {
          logger.error({ err, sessionId: session.id }, "onboarding session pipeline crashed");
        }),
      );

      res.json({ sessionId: session.id });
    }),
  );

  app.get(
    "/api/public/onboarding/sessions/:id/events",
    asyncHandler(async (req, res) => {
      const parsedId = sessionIdSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        return res.status(404).json({ success: false, error: "Session not found" });
      }
      const id = parsedId.data;

      const initial = await getSession(id);
      if (!initial) {
        return res.status(404).json({ success: false, error: "Session not found" });
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();

      let sent = 0;
      let lastWriteAt = Date.now();
      const write = (chunk: string) => {
        try {
          res.write(chunk);
          lastWriteAt = Date.now();
        } catch (err) {
          logger.warn({ err, sessionId: id }, "onboarding SSE: write failed");
        }
      };
      // The first read can go 30s without an event. An idle stream gets
      // dropped by proxies, so send a comment line on the same 15s cadence as
      // server/ask/stream.ts. SSE clients ignore lines starting with ":".
      const heartbeatIfIdle = () => {
        if (Date.now() - lastWriteAt >= SSE_HEARTBEAT_MS) write(": heartbeat\n\n");
      };

      let closed = false;
      req.on("close", () => {
        closed = true;
      });

      const flushNewEvents = (session: NonNullable<Awaited<ReturnType<typeof getSession>>>) => {
        const events = session.events;
        for (; sent < events.length; sent += 1) {
          write(`data: ${JSON.stringify(events[sent])}\n\n`);
        }
      };

      // Replay stored events first, so a reconnecting client loses nothing.
      flushNewEvents(initial);
      if (initial.status !== "running") {
        res.end();
        return;
      }

      await new Promise<void>((resolve) => {
        const timer = setInterval(async () => {
          if (closed) {
            clearInterval(timer);
            resolve();
            return;
          }
          const current = await getSession(id).catch(() => null);
          if (!current) {
            // Expired or removed mid-stream.
            clearInterval(timer);
            res.end();
            resolve();
            return;
          }
          flushNewEvents(current);
          heartbeatIfIdle();
          if (current.status !== "running") {
            clearInterval(timer);
            res.end();
            resolve();
          }
        }, SSE_POLL_INTERVAL_MS);
      });
    }),
  );

  app.post(
    "/api/public/onboarding/sessions/:id/answers",
    asyncHandler(async (req, res) => {
      const parsedId = sessionIdSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        return res.status(404).json({ success: false, error: "Session not found" });
      }
      const id = parsedId.data;

      const parsedBody = sessionAnswersSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          success: false,
          error: parsedBody.error.issues[0]?.message ?? "Invalid answers",
        });
      }

      const session = await getSession(id);
      if (!session || session.claimedBy) {
        return res.status(404).json({ success: false, error: "Session not found" });
      }

      await setAnswers(id, parsedBody.data);
      res.json({ success: true });
    }),
  );
}
