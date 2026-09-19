import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  RefreshCw,
  AlertTriangle,
  X as XIcon,
  Loader2,
  Circle,
  RotateCcw,
} from "lucide-react";
import { claimResponseSchema, pendingResponseSchema } from "@shared/onboarding/session";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Panel, PanelPage, PanelRow } from "@/components/dashboard-panels/Panel";

// ---------------------------------------------------------------------------
// Post-login claim screen. Replaces the pre-account domain/scrape/confirm
// scenes (docs/superpowers/specs/2026-09-18-onboarding-data-contract.md,
// "Sign-up and claim") - that whole flow now runs anonymously, before
// sign-up, at /start (src/routes/start.tsx, client/src/components/onboarding).
//
// This page's only job once a user lands here is:
//   1. GET /api/onboarding/pending - did they come from the anonymous flow?
//   2. If so, POST /api/onboarding/claim {sessionId} and show the SAME
//      ActivationPanel progress screen the old confirm flow used - claim
//      kicks off the same server-side autopilot, so the polling contract is
//      unchanged.
//   3. If not (no pending session, and no brands yet), send them to /start -
//      there is nothing left for this page to render pre-claim.
type Scene = "checking" | "activating" | "error";

// Server-driven activation pipeline state. The autopilot runs the phases
// strictly in order - FactSheet kernel first, then prompts grounded in
// it, then web-grounded citations - and is resumable server-side, so
// this screen only ever reflects status; it never drives the work.
type AutopilotStatus =
  | "idle"
  | "pending"
  | "scraping_facts"
  | "generating_prompts"
  | "running_citations"
  | "completed"
  | "failed";

type AutopilotData = {
  status: AutopilotStatus;
  step: number;
  progress: { promptsGenerated?: number; citationsRun?: number; citationsTotal?: number } | null;
  error: string | null;
};

// ---------------------------------------------------------------------------
// Activation pipeline model - the single source of progress truth.
// ---------------------------------------------------------------------------

const PHASES: { key: string; label: string; desc: string }[] = [
  {
    key: "facts",
    label: "Building your fact sheet",
    desc: "Reading your site and public sources to establish what's verifiably true about your brand. Everything else is measured against this.",
  },
  {
    key: "prompts",
    label: "Framing your prompts",
    desc: "Writing the real buyer questions we'll put to the AI engines, grounded in the fact sheet, not guesswork.",
  },
  {
    key: "citations",
    label: "Measuring AI citations",
    desc: "Asking ChatGPT, Claude, Gemini, Perplexity, DeepSeek and Grok those questions and recording where you're cited.",
  },
];

// status → index of the phase currently doing work (3 == all done).
function activeIndexFor(status: AutopilotStatus): number {
  switch (status) {
    case "generating_prompts":
      return 1;
    case "running_citations":
      return 2;
    case "completed":
      return 3;
    default:
      // idle | pending | scraping_facts | failed → fact-sheet phase
      return 0;
  }
}

// Quiet enter: opacity + 6px settle, exponential ease, honoring
// prefers-reduced-motion (collapses to an 80ms opacity fade, no move).
function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return (
    <div
      className={cn(
        "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity motion-reduce:duration-75",
        shown
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-1.5 motion-reduce:translate-y-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export default function Welcome() {
  const navigate = useNavigate();
  const rqClient = useQueryClient();

  const [scene, setScene] = useState<Scene>("checking");
  const [newBrandId, setNewBrandId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  // The claim response only returns a brandId (see shared/onboarding/session.ts
  // claimResponseSchema) - it doesn't carry back the brand's name, so this
  // panel uses the same generic fallback ActivationPanel has always shown
  // pre-name-resolution.
  const claimBrandName = "your brand";

  // Arriving straight from Stripe Checkout. The tier was granted by a webhook
  // while the customer was still on Stripe's domain, so the cached /api/auth/me
  // here is from before they had a plan - the trial banner and every limit
  // read off it would be a step behind for the whole session.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("checkout")) return;
    void rqClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  }, [rqClient]);

  // A returning customer who reactivates lands here too, and they already have
  // brands - this page is claim-only, so send them straight to the app.
  //
  // A failed `/api/brands` must NOT read the same as "confirmed zero
  // brands" - `data` stays `undefined` on error, which would otherwise make
  // `brandCount` fall back to 0 exactly like a genuinely brand-less
  // account. `isSuccess`/`isError` distinguish "confirmed zero" from
  // "couldn't check".
  const existingBrands = useQuery<{ success: boolean; data: unknown[] }>({
    queryKey: ["/api/brands"],
    meta: { suppressErrorToast: true },
  });
  const brandCount = existingBrands.data?.data?.length ?? 0;

  // Parsed with the same schema the route uses, so a shape change fails here
  // loudly instead of reading as "nothing pending".
  const pendingQuery = useQuery({
    queryKey: ["/api/onboarding/pending"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/onboarding/pending");
      return pendingResponseSchema.parse(await res.json());
    },
    meta: { suppressErrorToast: true },
  });

  const claimMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiRequest("POST", "/api/onboarding/claim", { sessionId });
      const data = await res.json();
      if (!res.ok || !data?.success) throw { body: data, status: res.status };
      return claimResponseSchema.parse(data);
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      await queryClient.refetchQueries({ queryKey: ["/api/brands"] });
      setNewBrandId(data.brandId);
      setScene("activating");
    },
    onError: (err: unknown) => {
      const body = (err as { body?: { error?: string; limitReached?: boolean } } | undefined)?.body;
      if (body?.limitReached) {
        void navigate({ to: "/pricing" });
        return;
      }
      setClaimError(body?.error || "Could not finish setting up your brand.");
      setScene("error");
    },
  });

  // Drives the claim/redirect decision once both queries have settled.
  useEffect(() => {
    if (scene !== "checking") return;
    if (existingBrands.isLoading || pendingQuery.isLoading) return;

    // A confirmed existing brand means this is a returning customer, not a
    // fresh claim - go straight to the app regardless of any pending session.
    if (existingBrands.isSuccess && brandCount > 0) {
      void navigate({ to: "/dashboard" });
      return;
    }

    // A failed pending check is not "nothing pending": redirecting would drop
    // the user's claim. Show the retryable error instead.
    if (pendingQuery.isError) {
      setClaimError("We couldn't check for your saved setup. Try again.");
      setScene("error");
      return;
    }

    const pendingSessionId = pendingQuery.data?.sessionId ?? null;
    if (pendingSessionId) {
      claimMutation.mutate(pendingSessionId);
      return;
    }

    // No pending session and (as far as we can confirm) no brands: there is
    // nothing pre-claim for this page to show. The anonymous flow lives at
    // /start now.
    if (existingBrands.isSuccess && brandCount === 0) {
      void navigate({ to: "/start" });
    }
    // If existingBrands errored, fall through to the render below, which
    // shows a distinct, retryable error rather than guessing either way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scene,
    existingBrands.isLoading,
    existingBrands.isSuccess,
    brandCount,
    pendingQuery.isLoading,
    pendingQuery.isError,
    pendingQuery.data,
  ]);

  // ---- Activation status poll -------------------------------------------
  // Mirrors the monitor-overview pattern: poll every 3s while the pipeline
  // is non-terminal, stop once it completes or fails. The work continues
  // server-side regardless of whether this tab is open.
  const {
    data: autopilotResp,
    isError: autopilotIsError,
    refetch: refetchAutopilotStatus,
  } = useQuery<{ success: boolean; data: AutopilotData | null }>({
    queryKey: ["autopilot-status", newBrandId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/onboarding/autopilot-status/${newBrandId}`);
      return res.json();
    },
    enabled: scene === "activating" && !!newBrandId,
    refetchInterval: (q) => {
      const status = (q.state.data as { data?: AutopilotData | null } | undefined)?.data?.status;
      return status === "completed" || status === "failed" ? false : 3000;
    },
    meta: { suppressErrorToast: true },
  });
  const autopilot = autopilotResp?.data ?? null;

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onboarding/autopilot-retry", {
        brandId: newBrandId,
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Couldn't restart setup");
      return data;
    },
    onSuccess: () => {
      rqClient.invalidateQueries({ queryKey: ["autopilot-status", newBrandId] });
    },
  });

  // Auto-advance into the Dashboard the moment the baseline is ready.
  useEffect(() => {
    if (scene !== "activating" || !newBrandId) return;
    if (autopilot?.status === "completed") {
      const t = setTimeout(
        () => navigate({ to: "/dashboard", search: { brandId: newBrandId } }),
        1100,
      );
      return () => clearTimeout(t);
    }
  }, [autopilot?.status, scene, newBrandId, navigate]);

  const checking =
    scene === "checking" ||
    existingBrands.isLoading ||
    pendingQuery.isLoading ||
    claimMutation.isPending;

  return (
    <PanelPage className="flex items-center justify-center p-6">
      {checking && !existingBrands.isError && (
        <Reveal className="w-full max-w-[480px]">
          <PanelRow cols={1} last>
            <Panel width="wide" border="last">
              <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" />
              <div className="mt-1 h-4 w-4/5 animate-pulse rounded bg-muted" />
            </Panel>
          </PanelRow>
        </Reveal>
      )}

      {existingBrands.isError && scene !== "activating" && (
        <Reveal className="w-full max-w-[480px]">
          <PanelRow cols={1} last>
            <Panel width="wide" border="last">
              <h1 className="text-page font-semibold tracking-tight text-foreground">
                {"Couldn't check your account"}
              </h1>
              <p className="mt-2 text-caption text-muted-foreground">
                {
                  "We couldn't tell whether you already have a brand set up here. Starting a new one before checking again could create a duplicate."
                }
              </p>
              <Button
                className="mt-6 w-full"
                variant="outline"
                onClick={() => existingBrands.refetch()}
                data-testid="button-retry-brand-check"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </Button>
            </Panel>
          </PanelRow>
        </Reveal>
      )}

      {scene === "error" && (
        <Reveal className="w-full max-w-[480px]">
          <PanelRow cols={1} last>
            <Panel width="wide" border="last">
              <h1 className="text-page font-semibold tracking-tight text-foreground">
                Could not finish setting up your brand
              </h1>
              <p className="mt-2 text-caption text-muted-foreground">{claimError}</p>
              <Button
                className="mt-6 w-full"
                variant="outline"
                onClick={() => {
                  setScene("checking");
                  setClaimError(null);
                  void pendingQuery.refetch();
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </Button>
            </Panel>
          </PanelRow>
        </Reveal>
      )}

      {scene === "activating" && newBrandId && (
        <Reveal className="w-full max-w-[560px]">
          <ActivationPanel
            brandName={claimBrandName}
            autopilot={autopilot}
            autopilotIsError={autopilotIsError}
            onGoToDashboard={() => navigate({ to: "/dashboard", search: { brandId: newBrandId } })}
            onRetry={() => retryMutation.mutate()}
            onRefetchStatus={() => refetchAutopilotStatus()}
            retrying={retryMutation.isPending}
          />
        </Reveal>
      )}
    </PanelPage>
  );
}

// ---------------------------------------------------------------------------
// Activation panel - the ONE progress surface. Ordered phases, four-state
// vocabulary (Done / Working / Queued), one editorial verdict line, honest
// "this finishes without you" copy, and a non-blocking path forward.
//
// Unchanged from the pre-redesign confirm flow (docs/superpowers/specs/2026-09-18-onboarding-data-contract.md
// keeps claim's server contract identical to the old confirm's), and its
// polling logic and props stay verbatim - tests/unit/welcomeActivationPanelAndBrandCount.test.tsx
// exercises this component directly.
// ---------------------------------------------------------------------------

export function ActivationPanel({
  brandName,
  autopilot,
  autopilotIsError,
  onGoToDashboard,
  onRetry,
  onRefetchStatus,
  retrying,
}: {
  brandName: string;
  autopilot: AutopilotData | null;
  autopilotIsError: boolean;
  onGoToDashboard: () => void;
  onRetry: () => void;
  onRefetchStatus: () => void;
  retrying: boolean;
}) {
  const status: AutopilotStatus = autopilot?.status ?? "pending";
  const jobFailed = status === "failed";
  const done = status === "completed";
  const checkFailed = autopilotIsError && !done;
  const failed = jobFailed || checkFailed;
  const activeIndex = activeIndexFor(status);
  const citTotal = autopilot?.progress?.citationsTotal ?? 0;
  const citRun = autopilot?.progress?.citationsRun ?? 0;

  const verdict = done
    ? `${brandName}'s AI-visibility baseline is ready.`
    : jobFailed
      ? "Setup stopped partway. Your brand is saved - retry, or pick it up from the dashboard."
      : checkFailed
        ? "We couldn't check your setup's progress just now. Your brand is saved and setup may still be finishing in the background."
        : `We're establishing how AI engines represent ${brandName}. This runs on its own.`;

  return (
    <PanelRow cols={1} last>
      <Panel width="wide" border="last">
        <div className="flex items-center gap-3">
          {done ? (
            <CheckCircle className="h-5 w-5 text-primary" aria-hidden="true" />
          ) : failed ? (
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
          <h2 className="text-page font-semibold tracking-tight">
            {done ? "You're set" : failed ? "Setup interrupted" : "Establishing your baseline"}
          </h2>
        </div>

        {/* The single editorial verdict sentence - advisor voice, stated
            before the detail. Serif is the one warmth tell. */}
        <p
          className="mt-3 text-ui leading-snug text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {verdict}
        </p>

        <ol className="mt-7 space-y-1">
          {PHASES.map((phase, i) => {
            const state: "done" | "working" | "queued" =
              done || i < activeIndex ? "done" : i === activeIndex ? "working" : "queued";
            const isCitations = phase.key === "citations";
            return (
              <li key={phase.key} className="flex gap-3 rounded-md px-2 py-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {state === "done" ? (
                    <CheckCircle className="h-5 w-5 text-primary" aria-hidden="true" />
                  ) : state === "working" && !failed ? (
                    <Loader2
                      className="h-[18px] w-[18px] animate-spin text-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="h-[18px] w-[18px] text-muted-foreground/35"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p
                      className={cn(
                        "text-caption font-medium",
                        state === "queued" ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {phase.label}
                    </p>
                    <span
                      className={cn(
                        "text-data font-medium uppercase tracking-wide",
                        state === "done"
                          ? "text-primary"
                          : state === "working" && !failed
                            ? "text-foreground"
                            : "text-muted-foreground/60",
                      )}
                    >
                      {state === "done"
                        ? "Done"
                        : state === "working" && !failed
                          ? "Working"
                          : "Queued"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">
                    {phase.desc}
                  </p>
                  {isCitations && state === "working" && citTotal > 0 ? (
                    <p className="mt-1.5 font-mono text-caption tabular-nums text-muted-foreground">
                      {citRun}/{citTotal} prompts checked
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        {jobFailed && autopilot?.error ? (
          <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-caption text-destructive">
            {autopilot.error}
          </div>
        ) : null}
        {checkFailed ? (
          <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-caption text-destructive">
            {
              "We couldn't reach the server to check progress. Setup may still be running - try checking again."
            }
          </div>
        ) : null}

        <div className="mt-7 flex items-center justify-between gap-3">
          <p className="text-caption text-muted-foreground">
            {done
              ? "Taking you to your dashboard…"
              : "Safe to leave - this finishes in the background."}
          </p>
          <div className="flex gap-2">
            {failed ? (
              <Button
                variant="outline"
                size="sm"
                onClick={jobFailed ? onRetry : onRefetchStatus}
                disabled={retrying}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {retrying ? "Retrying…" : jobFailed ? "Retry" : "Check again"}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={done ? "default" : "outline"}
              onClick={onGoToDashboard}
              data-testid="button-skip-to-dashboard"
            >
              {done ? "Go to dashboard" : "Go to dashboard"}
              <ArrowRightIcon />
            </Button>
          </div>
        </div>
      </Panel>
    </PanelRow>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      className="ml-1.5 h-3.5 w-3.5"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// FieldLabel / TagField - kept for tests/unit/welcomeAndManualPasteLabels.test.tsx
// (an accessibility-labeling regression test) even though the confirm scene
// that used to render them is deleted. Neither is referenced from this file's
// own render path any more.
// ---------------------------------------------------------------------------

export function FieldLabel({
  label,
  touched,
  htmlFor,
}: {
  label: string;
  touched: boolean;
  htmlFor: string;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <label htmlFor={htmlFor} className="text-caption font-medium text-foreground">
        {label}
      </label>
      {!touched ? (
        <span className="rounded-full bg-secondary px-2 py-0.5 text-label font-normal text-secondary-foreground">
          auto-detected
        </span>
      ) : null}
    </div>
  );
}

function splitCsv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function TagField({
  label,
  htmlId,
  values,
  touched,
  onChange,
}: {
  label: string;
  htmlId: string;
  values: string[];
  touched: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const commitDraft = () => {
    const parts = splitCsv(draft);
    if (parts.length) {
      onChange([...values, ...parts]);
    }
    setDraft("");
  };
  return (
    <div className="mt-4">
      <FieldLabel label={label} touched={touched} htmlFor={htmlId} />
      <div className="flex flex-wrap gap-2 rounded-md border bg-background p-2">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-caption"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              className="text-muted-foreground hover:text-foreground"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={htmlId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitDraft();
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={commitDraft}
          placeholder={values.length ? "" : "Type and press Enter"}
          className="flex-1 min-w-[120px] bg-transparent text-caption outline-hidden placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
