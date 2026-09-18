// read_page - the only tool that fetches a live URL chosen by the model.
// Highest abuse risk of any tool (07-integration-and-hardening.md §6): the
// model picks the target. Three layers, in order:
//
//   1. SSRF safety - server/lib/ssrf.ts's safeFetchText, which blocks
//      private/loopback/link-local IPs and re-validates on EVERY redirect
//      hop (see fetchRevalidatingRedirects). Reused, not reimplemented.
//   2. Feature allowlist - own domain + declared competitor domains +
//      hosts already present in this brand's cited geo_rankings rows
//      (round-2 decision 4). Checked against BOTH the requested host and
//      the final post-redirect host (safeFetchText now returns `finalUrl`),
//      so a redirect cannot walk the fetch off the allowlist even though it
//      cannot walk it past the SSRF blocklist either.
//   3. Content extraction - pageText.ts's extractPageContent, which also
//      flags client-rendered shells (isClientRendered) - the exact signal
//      that let Trakkr diagnose "Vercel is delivering the shell, with the
//      list content hydrated after load" in 01-trakkr-teardown.md R5.
//
// Untrusted content: the extracted text is returned to the model wrapped in
// an explicit delimiter and labelled untrusted in server/ask/prompt.ts.
// Defence in depth only - the real control against injection is structural
// parameter validation in propose.ts (07 §6.1): fetched text can never
// itself become an executable action parameter.
import { z } from "zod";
import { safeFetchText } from "../../lib/ssrf";
import { extractPageContent } from "../../lib/pageText";
import { ASK_READ_PAGE_MAX_BYTES, ASK_READ_PAGE_TIMEOUT_MS } from "@shared/ask/constants";
import type { AskTool } from "./types";
import { runToolSafely } from "./types";

const inputSchema = z.object({
  url: z.string().url(),
});
type Input = z.infer<typeof inputSchema>;

type Output = {
  url: string;
  fetched: boolean;
  isClientRendered: boolean;
  text: string;
  reason?: string;
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export const readPageTool: AskTool<Input, Output> = {
  name: "read_page",
  label: "Reading page",
  category: "sources",
  description:
    "Fetches and extracts the text content of a specific URL - the brand's own site, a declared competitor's site, or a page already cited as a source. Use this to inspect what a page actually says or how it renders, not to browse the open web.",
  input: inputSchema,
  costHint: "network",
  run: (ctx, input) =>
    runToolSafely("read_page", async () => {
      const allowlist = await ctx.getReadPageAllowlist();
      const requestedHost = hostOf(input.url);
      if (!requestedHost || !allowlist.has(requestedHost)) {
        return {
          data: {
            url: input.url,
            fetched: false,
            isClientRendered: false,
            text: "",
            reason:
              "URL is outside this run's allowlist (brand, competitor and cited-source domains only)",
          },
          summary: `Page not read: ${requestedHost ?? input.url} is outside the allowed domains`,
          status: "failed" as const,
        };
      }

      let fetched: Awaited<ReturnType<typeof safeFetchText>>;
      try {
        fetched = await safeFetchText(input.url, {
          maxBytes: ASK_READ_PAGE_MAX_BYTES,
          timeoutMs: ASK_READ_PAGE_TIMEOUT_MS,
        });
      } catch (err) {
        // assertSafeUrl (inside safeFetchText) throws a plain Error for any
        // SSRF-disallowed target (private/loopback/link-local, DNS failure,
        // redirect loop, oversize body). Caught generically here rather than
        // by class, since server/lib/ssrf.ts does not export a dedicated
        // error type for this - re-thrown otherwise-unreachable failures
        // still land in this same "page not read" shape via the outer
        // runToolSafely wrapper if this branch is ever wrong about that.
        const message = err instanceof Error ? err.message : String(err);
        return {
          data: {
            url: input.url,
            fetched: false,
            isClientRendered: false,
            text: "",
            reason: `Page could not be fetched: ${message}`,
          },
          summary: `Page not read: ${requestedHost ?? input.url} could not be fetched`,
          status: "failed" as const,
        };
      }

      // Re-check the allowlist against where the request actually landed -
      // safeFetchText re-validates SSRF safety on every redirect hop, but a
      // redirect could still land on a public host outside this run's
      // feature allowlist (e.g. brand.com -> cdn.thirdparty.com).
      const finalHost = hostOf(fetched.finalUrl);
      if (!finalHost || !allowlist.has(finalHost)) {
        return {
          data: {
            url: input.url,
            fetched: false,
            isClientRendered: false,
            text: "",
            reason: `Redirected to ${finalHost ?? "an unknown host"}, which is outside this run's allowlist`,
          },
          summary: `Page not read: redirected outside the allowed domains`,
          status: "failed" as const,
        };
      }

      if (fetched.status < 200 || fetched.status >= 300) {
        return {
          data: {
            url: input.url,
            fetched: false,
            isClientRendered: false,
            text: "",
            reason: `Page returned HTTP ${fetched.status}`,
          },
          summary: `Page not read: HTTP ${fetched.status}`,
          status: "failed" as const,
        };
      }

      const content = extractPageContent(fetched.text);
      ctx.incrementPagesRead();

      const data: Output = {
        url: fetched.finalUrl,
        fetched: true,
        isClientRendered: content.isClientRendered,
        text: content.text,
      };

      return {
        data,
        summary: content.isClientRendered
          ? `Read ${finalHost}: page appears client-rendered (little content in initial HTML)`
          : `Read ${finalHost}: ${content.text.length} chars extracted`,
        status: "ok" as const,
      };
    }),
};
