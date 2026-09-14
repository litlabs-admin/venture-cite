import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { requireBrand, requireUser } from "../lib/ownership";
import { asyncHandler, sendError } from "../lib/routesShared";
import { safeFetchText } from "../lib/ssrf";
import { extractCanonicalUrl, hasReadableText } from "./v2PublicationCheckParsing";

// Board 16 (publication check) needs one thing no other endpoint gives it: a
// live read of the page the task claims was changed, taken right now rather
// than from whatever the last crawl happened to see. `safeFetchText`
// (server/lib/ssrf.ts) is the codebase's one hardened outbound fetch - DNS
// rebinding is checked, private/loopback targets are refused, and the read
// is capped in both size and time - so this route is a thin, timed wrapper
// around it rather than a second fetch implementation.
//
// The URL comes from the request body, not re-derived from the task's
// evidence: the "Published URL" field in the board is editable (the person
// verifying may have moved the page, or want to check a different one), and
// this endpoint answers "what does this URL look like right now", not
// "refetch exactly what the task recorded".

const publicationCheckRequestSchema = z
  .object({
    url: z
      .string()
      .url()
      .refine((value) => /^https?:\/\//i.test(value), "Only http(s) URLs are supported"),
  })
  .strict();

const FETCH_TIMEOUT_MS = 8_000;

export function setupV2PublicationCheckRoutes(app: Express): void {
  app.post(
    "/api/brands/:brandId/work/tasks/:taskId/publication-check",
    isAuthenticated,
    asyncHandler(async (req, res) => {
      const parsed = publicationCheckRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, error: "invalid_request", details: parsed.error.issues });
      }

      const user = requireUser(req);
      try {
        await requireBrand(req.params.brandId, user.id);
      } catch (error) {
        return sendError(res, error, "Brand not found");
      }
      // `:taskId` is not looked up here - the check is of the URL the caller
      // supplies, not of a stored task field - but the path still carries it
      // so the check is scoped, logged and rate-limited per task like every
      // other work-task action, matching the shape of the commands/verify
      // endpoints above it.
      if (!req.params.taskId) {
        return res.status(400).json({ success: false, error: "invalid_request" });
      }

      try {
        const fetched = await safeFetchText(parsed.data.url, { timeoutMs: FETCH_TIMEOUT_MS });
        return res.json({
          success: true,
          data: {
            url: parsed.data.url,
            status: fetched.status,
            canonical: extractCanonicalUrl(fetched.text) ?? null,
            textPresent: hasReadableText(fetched.text),
            checkedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        // A refused or unreachable page is an answer, not a server failure -
        // the board shows it as a failed check, not an error banner.
        return res.json({
          success: true,
          data: {
            url: parsed.data.url,
            status: null,
            canonical: null,
            textPresent: false,
            checkedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : "The page could not be fetched.",
          },
        });
      }
    }),
  );
}
