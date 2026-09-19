// The six left-hand step panels of the onboarding flow. One component per
// step, matching build2.py's left_* functions and the reference PNGs
// (Website / Scan / Who / Brand / FirstRead / Save states).
import { competitorSummary, plural, tallyProbe } from "./probeTally";
import { useEffect, useState } from "react";
import {
  Globe,
  Mail,
  Lock,
  Pencil,
  User,
  Users,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PASSWORD_RULES } from "@shared/passwordPolicy";
import type {
  Profile,
  Competitor,
  Competitors,
  Topic,
  Probe,
  Insight,
  Source,
} from "@shared/onboarding/session";
import { validateDomain } from "@shared/validateDomain";
import {
  StepHeading,
  BrandLine,
  Favicon,
  EngineIcon,
  Eyebrow,
  Mono,
  UnavailableNotice,
} from "./shared";

// ---------- step 1: website ----------
export function WebsiteStep({
  domain,
  onDomainChange,
  onSubmit,
  submitting,
  error,
}: {
  domain: string;
  onDomainChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const validation = domain ? validateDomain(domain) : null;
  const canSubmit = !!validation && validation.valid && !submitting;
  return (
    <div className="flex flex-col gap-6">
      <StepHeading
        title="See how AI engines answer for your brand"
        sub="Enter your website. We ask ChatGPT, Claude, Gemini, Perplexity, DeepSeek and Grok what your buyers ask, and show you where you come up."
      />
      <div className="flex flex-col gap-2">
        <label htmlFor="onboarding-domain" className="text-caption font-medium text-vc-primary">
          Website
        </label>
        <div className="flex items-center gap-2.5 rounded-md border border-vc-default bg-background px-3 focus-within:border-vc-accent focus-within:ring-3 focus-within:ring-vc-accent-subtle">
          <Globe className="h-4 w-4 shrink-0 text-vc-tertiary" strokeWidth={1.5} />
          <Input
            id="onboarding-domain"
            value={domain}
            onChange={(e) => onDomainChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) onSubmit();
            }}
            placeholder="yourbrand.com"
            autoFocus
            data-testid="input-onboarding-domain"
            className="h-[38px] flex-1 border-0 bg-transparent px-0 text-caption shadow-none focus-visible:ring-0"
          />
        </div>
        {error ? (
          <p className="text-caption text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-caption text-vc-tertiary">
            We read your site and public sources. You check everything before it goes live.
          </p>
        )}
      </div>
      <Button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="h-10 w-full justify-center gap-2"
        data-testid="button-onboarding-continue"
      >
        {submitting ? "Starting…" : "Continue"}
      </Button>
    </div>
  );
}

// ---------- step 2: scan ----------
const SCAN_LINE_MS = 1800;

export function ScanStep({
  domain,
  loadingLines,
  ready,
  errorMessage,
  onRetry,
  onDone,
}: {
  domain: string;
  loadingLines: string[] | null;
  /** The profile has arrived, so the scan can finish once every line has shown. */
  ready: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onDone: () => void;
}) {
  const lines = loadingLines ?? [
    "Reading your homepage",
    "Checking public sources",
    "Mapping competitors",
    "Writing buyer questions",
  ];
  // Lines before `active` are done, `active` is working, the rest wait. Each
  // line gets its own beat so the user can read what is happening; the last
  // one keeps spinning until the profile is actually back.
  const [active, setActive] = useState(0);
  const allDone = ready && active >= lines.length;

  useEffect(() => {
    if (errorMessage) return;
    if (active < lines.length - 1 || (ready && active === lines.length - 1)) {
      const timer = setTimeout(() => setActive((a) => a + 1), SCAN_LINE_MS);
      return () => clearTimeout(timer);
    }
  }, [active, ready, lines.length, errorMessage]);

  useEffect(() => {
    if (!allDone) return;
    const timer = setTimeout(onDone, 600);
    return () => clearTimeout(timer);
  }, [allDone, onDone]);

  const pct = Math.min(100, Math.round(((active + (ready ? 0 : 0.5)) / lines.length) * 100));

  return (
    <div className="flex flex-col gap-6">
      <StepHeading
        title={`Reading ${domain}`}
        sub="We're building your profile, finding who you compete with and writing the questions buyers ask AI."
      />
      {errorMessage ? (
        <div className="flex flex-col gap-3">
          <UnavailableNotice message={errorMessage} />
          <Button variant="outline" onClick={onRetry} className="w-full">
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-vc-default bg-background">
            {lines.map((line, i) => {
              const state = i < active ? "done" : i === active ? "working" : "todo";
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 transition-opacity duration-300",
                    i < lines.length - 1 && "border-b border-vc-muted",
                    state === "todo" && "opacity-40",
                  )}
                >
                  {state === "done" ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-positive animate-in zoom-in-50 duration-200" />
                  ) : state === "working" ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-vc-accent" />
                  ) : (
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-vc-default" />
                  )}
                  <span
                    className={cn(
                      "truncate text-caption",
                      state === "working" ? "font-medium text-vc-primary" : "text-vc-secondary",
                    )}
                  >
                    {line}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-[3px] overflow-hidden rounded-sm bg-vc-default">
              <div
                className="h-full rounded-sm bg-vc-accent transition-[width] duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-caption text-vc-tertiary">
              {allDone ? "Done." : `Step ${Math.min(active + 1, lines.length)} of ${lines.length}`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
// ---------- step 3: who ----------
function AudienceOption({
  title,
  body,
  Icon,
  selected,
  onSelect,
  testId,
}: {
  title: string;
  body: string;
  Icon: typeof User;
  selected: boolean;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={testId}
      className={cn(
        "flex flex-1 flex-col gap-3 rounded-lg border bg-background p-4 text-left transition-colors",
        selected ? "border-vc-accent ring-3 ring-vc-accent-subtle" : "border-vc-default",
      )}
    >
      <div className="flex items-center justify-between">
        <Icon className="h-[18px] w-[18px] text-vc-primary" strokeWidth={1.5} />
        <span
          className={cn(
            "flex h-[18px] w-[18px] items-center justify-center rounded-full",
            selected ? "bg-vc-accent-hover" : "border-[1.5px] border-vc-default",
          )}
        >
          {selected ? <CheckMini /> : null}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-caption font-semibold text-vc-primary">{title}</span>
        <span className="text-label leading-relaxed text-vc-tertiary">{body}</span>
      </div>
    </button>
  );
}

function CheckMini() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={2}>
      <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WhoStep({
  brandName,
  domain,
  favicon,
  audience,
  agencyName,
  onAudienceChange,
  onAgencyNameChange,
  onSubmit,
  submitting,
}: {
  brandName: string;
  domain: string;
  favicon: string;
  audience: "own" | "client" | null;
  agencyName: string;
  onAudienceChange: (v: "own" | "client") => void;
  onAgencyNameChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const enabled = audience === "own" || (audience === "client" && agencyName.trim().length > 0);
  return (
    <div className="flex flex-col gap-6">
      <BrandLine favicon={favicon} brandName={brandName} domain={domain} />
      <StepHeading
        title="Who are you measuring?"
        sub="This sets up your workspace. You can change it later in Settings."
      />
      <div className="flex gap-3">
        <AudienceOption
          title="My own brand"
          body={`Track ${brandName} against its competitors.`}
          Icon={User}
          selected={audience === "own"}
          onSelect={() => onAudienceChange("own")}
          testId="option-audience-own"
        />
        <AudienceOption
          title="A client"
          body="For agencies and consultants reporting to someone else."
          Icon={Users}
          selected={audience === "client"}
          onSelect={() => onAudienceChange("client")}
          testId="option-audience-client"
        />
      </div>
      {audience === "client" ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="agency-name" className="text-caption font-medium text-vc-primary">
            Agency name
          </label>
          <Input
            id="agency-name"
            value={agencyName}
            onChange={(e) => onAgencyNameChange(e.target.value)}
            placeholder="e.g. Northside Partners"
            data-testid="input-agency-name"
            autoFocus
          />
          <p className="text-caption text-vc-tertiary">
            Shown on your workspace and on reports you share.
          </p>
        </div>
      ) : null}
      <Button
        onClick={onSubmit}
        disabled={!enabled || submitting}
        className="h-10 w-full justify-center gap-2"
        data-testid="button-who-continue"
      >
        {submitting ? "Saving…" : "Continue"}
      </Button>
    </div>
  );
}

// ---------- step 4: brand ----------
function CompetitorChip({ competitor }: { competitor: Competitor }) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-md border border-vc-default px-3 text-caption text-vc-primary">
      <Favicon src={competitor.faviconUrl} size={16} radius={4} />
      <span className="min-w-0 flex-1 truncate">{competitor.name}</span>
    </div>
  );
}

export function BrandStep({
  brandName,
  domain,
  favicon,
  profile,
  competitors,
  isClient,
  onLooksRight,
  onChangeDomain,
  onEditProfile,
}: {
  brandName: string;
  domain: string;
  favicon: string;
  profile: Profile | null;
  competitors: Competitors | null;
  isClient: boolean;
  onLooksRight: () => void;
  onChangeDomain: () => void;
  onEditProfile: (patch: Partial<Profile>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const title = isClient ? "Confirm your client" : `Is this ${brandName}?`;
  const sub = isClient
    ? `We'll add ${brandName} to your workspace and ask every engine about it, so you can show them where AI leaves them out.`
    : "Here's what we read on your site. Fix anything that's off. Every answer we check is measured against this.";

  return (
    <div className="flex flex-col gap-5">
      <BrandLine favicon={favicon} brandName={brandName} domain={domain} />
      <StepHeading title={title} sub={sub} />

      <div className="overflow-hidden rounded-lg border border-vc-default bg-background">
        <div className="flex items-center justify-between gap-3 border-b border-vc-default px-4 py-3">
          <span className="text-caption font-semibold text-vc-primary">{brandName}</span>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="flex items-center gap-1.5 text-caption text-vc-tertiary"
            data-testid="button-toggle-edit-brand"
          >
            {editing ? (
              <span className="font-medium text-vc-accent">Done</span>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                Edit
              </>
            )}
          </button>
        </div>
        <div className="p-4">
          {!profile ? (
            <div className="flex flex-col gap-2">
              <div className="h-3 w-full animate-pulse rounded bg-vc-muted" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-vc-muted" />
            </div>
          ) : editing ? (
            <div className="flex flex-col gap-2.5">
              <Input
                value={profile.description}
                onChange={(e) => onEditProfile({ description: e.target.value })}
                data-testid="input-brand-description"
              />
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-caption text-vc-tertiary">Industry</span>
                <Input
                  value={profile.industry}
                  onChange={(e) => onEditProfile({ industry: e.target.value })}
                  data-testid="input-brand-industry"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="text-caption leading-relaxed text-vc-secondary">
                {profile.description}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex min-h-[22px] max-w-full items-center rounded-md py-0.5 bg-vc-muted px-2 text-label text-vc-secondary">
                  {profile.industry}
                </span>
                <span className="inline-flex min-h-[22px] max-w-full items-center rounded-md bg-vc-muted px-2 py-0.5 text-label text-vc-secondary">
                  {profile.descriptor}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex justify-between text-caption">
          <span className="font-medium text-vc-primary">
            {isClient ? `${brandName}'s competitors` : "Competitors"}
          </span>
          {competitors ? (
            <Mono>
              {competitors.shown.length} tracked ·{" "}
              {Math.max(0, competitors.totalFound - competitors.shown.length)} more found
            </Mono>
          ) : null}
        </div>
        {!competitors ? (
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-vc-muted" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {competitors.shown.map((c) => (
              <CompetitorChip key={c.domain} competitor={c} />
            ))}
          </div>
        )}
      </div>

      <Button
        onClick={onLooksRight}
        disabled={!profile}
        className="h-10 w-full justify-center gap-2"
        data-testid="button-brand-looks-right"
      >
        Looks right
      </Button>
      <p className="text-center text-caption text-vc-tertiary">
        Wrong website?{" "}
        <button type="button" onClick={onChangeDomain} className="text-vc-accent">
          Change it
        </button>
      </p>
    </div>
  );
}

// ---------- step 5: first read ----------
export function FirstReadStep({
  brandName,
  favicon,
  probe,
  probeError,
  prompts,
  insight,
  insightError,
  onContinue,
}: {
  brandName: string;
  favicon: string;
  probe: Probe | null;
  probeError: string | null;
  /** The prompts the probe is running, known before its answers arrive. */
  prompts: string[];
  insight: Insight | null;
  insightError: string | null;
  onContinue: () => void;
}) {
  const [tipOpen, setTipOpen] = useState(false);
  const tally = probe ? tallyProbe(probe) : null;
  const promptsTested = probe?.promptsTested ?? 0;
  const brandAppearances = tally?.brandNamed ?? 0;
  const totalAnswers = tally?.answers ?? 0;
  const notCited = !!tally && brandAppearances === 0;
  // Prefer an answer that named the brand; otherwise the first one back.
  const sample = probe?.results.find((r) => r.brandCited) ?? probe?.results[0] ?? null;
  const engines = [...new Set(probe?.results.map((r) => r.engine) ?? [])];

  if (probeError) {
    return (
      <div className="flex flex-col gap-4">
        <StepHeading title={`We couldn't check ${brandName} this time`} sub="" />
        <UnavailableNotice message={probeError} />
        <Button onClick={onContinue} className="h-10 w-full justify-center">
          Continue
        </Button>
      </div>
    );
  }

  if (!probe) {
    return (
      <div className="flex flex-col gap-4" data-testid="first-read-pending">
        <StepHeading
          title={`Asking AI about ${brandName}`}
          sub={`Running ${plural(prompts.length || 3, "buyer question")} through Gemini and ChatGPT. This takes under 30 seconds.`}
        />
        <div className="overflow-hidden rounded-lg border border-vc-default bg-background">
          {(prompts.length ? prompts : [null, null, null]).map((prompt, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-vc-muted px-4 py-3 last:border-b-0"
            >
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-vc-tertiary" />
              {prompt ? (
                <span className="min-w-0 flex-1 truncate text-caption text-vc-secondary">
                  {prompt}
                </span>
              ) : (
                <span className="h-3 flex-1 animate-pulse rounded bg-vc-muted" />
              )}
              <EngineIcon engine="Gemini" size={14} />
              <EngineIcon engine="ChatGPT" size={14} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const stagger = (ms: number) => ({
    animationDelay: `${ms}ms`,
    animationFillMode: "both" as const,
  });
  const reveal =
    "animate-in fade-in slide-in-from-bottom-1 duration-500 motion-reduce:slide-in-from-bottom-0";

  return (
    <div className="flex flex-col gap-4">
      <BrandLine favicon={favicon} domain="" showName={false} />
      <StepHeading
        title={
          notCited
            ? `AI didn't cite ${brandName} in ${plural(promptsTested, "buyer question")}`
            : `${brandName} was named in ${brandAppearances} of ${plural(totalAnswers, "answer")}`
        }
        sub={tally ? competitorSummary(tally) : ""}
      />

      <div
        className={cn("overflow-hidden rounded-lg border border-vc-default bg-background", reveal)}
        style={stagger(150)}
      >
        <div className="flex items-center justify-between gap-3 border-b border-vc-default px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Favicon src={favicon} size={20} radius={5} />
            <div className="flex min-w-0 flex-col">
              <span className="text-caption font-semibold text-vc-primary">{brandName}</span>
              <span className="text-[11px] text-vc-tertiary">
                {notCited
                  ? `Not cited across ${plural(promptsTested, "prompt")}`
                  : `Named in ${brandAppearances} of ${plural(totalAnswers, "answer")}`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {engines.map((e) => (
              <EngineIcon key={e} engine={e} size={14} />
            ))}
            <span
              className={cn(
                "inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold uppercase tracking-wide",
                notCited
                  ? "bg-destructive-subtle text-destructive"
                  : "bg-positive-subtle text-positive",
              )}
            >
              {notCited ? "Not cited" : "Cited"}
            </span>
          </div>
        </div>
        {sample ? (
          <div className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2">
              <Eyebrow>Sample answer</Eyebrow>
              <EngineIcon engine={sample.engine} size={12} />
            </div>
            <p className="text-caption italic text-vc-secondary">&#8220;{sample.prompt}&#8221;</p>
            <div className="line-clamp-3 rounded-md bg-vc-muted p-2.5 text-caption leading-relaxed text-vc-secondary">
              {sample.snippet}&#8230;
            </div>
          </div>
        ) : null}
      </div>

      {insight ? (
        <div
          className={cn(
            "overflow-hidden rounded-lg border border-vc-default bg-background",
            reveal,
          )}
          style={stagger(350)}
        >
          <button
            type="button"
            onClick={() => setTipOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3"
            data-testid="button-toggle-insight"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-vc-accent" />
              <span className="truncate text-caption font-medium text-vc-primary">
                {insight.headline}
              </span>
            </span>
            {tipOpen ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-vc-tertiary" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-vc-tertiary" />
            )}
          </button>
          {tipOpen ? (
            <div className="flex flex-col gap-2 px-4 pb-3.5 pl-8">
              <p className="text-caption leading-relaxed text-vc-secondary">{insight.detail}</p>
              {insight.evidenceQuote ? (
                <div className="border-l-2 border-vc-default pl-2.5 text-caption text-vc-tertiary">
                  From your homepage: &#8220;{insight.evidenceQuote}&#8221;
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : insightError ? (
        <UnavailableNotice message="We couldn't write a recommendation for this site this time. Your first read above is unaffected." />
      ) : (
        <div className="flex items-center gap-2.5 rounded-lg border border-vc-default px-4 py-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-vc-tertiary" />
          <span className="text-caption text-vc-tertiary">Writing your first recommendation…</span>
        </div>
      )}

      <div className={cn("flex flex-col gap-2", reveal)} style={stagger(500)}>
        <Button
          onClick={onContinue}
          className="h-10 w-full justify-center gap-2"
          data-testid="button-first-read-continue"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
// ---------- step 6: save ----------
export function SaveStep({
  brandName,
  topics,
  promptsTested,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  submitting,
  submitError,
  sent,
  onResend,
  resending,
}: {
  brandName: string;
  topics: Topic[] | null;
  promptsTested: number;
  email: string;
  password: string;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
  sent: boolean;
  onResend: () => void;
  resending: boolean;
}) {
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const rulesMet = PASSWORD_RULES.map((r) => r.test(password));
  const allRulesMet = rulesMet.every(Boolean);
  const canSubmit = emailOk && allRulesMet && !submitting;
  const total = topics?.reduce((sum, t) => sum + t.prompts.length, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <StepHeading
        title={`Save ${brandName}'s baseline`}
        sub={`We checked ${plural(promptsTested, "question")} on 2 engines. The baseline asks ${total || "more"}, on all six. Create an account to keep it.`}
      />

      <div className="overflow-hidden rounded-lg border border-vc-default bg-background">
        <div className="flex items-center justify-between gap-3 border-b border-vc-default px-4 py-3">
          <span className="text-caption font-medium text-vc-primary">Your full baseline</span>
          <Mono>{total ? `${plural(total, "question")} × 6 engines` : "…"}</Mono>
        </div>
        <div className="flex flex-col gap-2.5 p-4">
          {topics
            ? topics.map((t) => (
                <div key={t.topic} className="flex justify-between text-caption text-vc-primary">
                  <span>{t.topic}</span>
                  <Mono>{plural(t.prompts.length, "question")}</Mono>
                </div>
              ))
            : [0, 1, 2].map((i) => (
                <div key={i} className="h-3 w-3/4 animate-pulse rounded bg-vc-muted" />
              ))}
        </div>
      </div>

      {sent ? (
        <div className="flex flex-col gap-2 rounded-lg border border-vc-default bg-background p-5">
          <div className="flex items-center gap-2.5">
            <Mail className="h-[18px] w-[18px] text-vc-accent" strokeWidth={1.5} />
            <span className="text-ui font-semibold text-vc-primary">Confirm your email</span>
          </div>
          <p className="text-caption leading-relaxed text-vc-secondary">
            We sent a link to <span className="font-medium text-vc-primary">{email}</span>. Open it,
            sign in, and {brandName}&#39;s baseline starts running. Everything you set up here is
            kept.
          </p>
          <div className="text-caption text-vc-tertiary">
            No email after a minute?{" "}
            <button
              type="button"
              onClick={onResend}
              disabled={resending}
              className="text-vc-accent"
            >
              {resending ? "Sending…" : "Send it again"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-caption font-medium text-vc-primary" htmlFor="save-email">
              Work email
            </label>
            <div className="flex items-center gap-2.5 rounded-md border border-vc-default bg-background px-3 focus-within:border-vc-accent focus-within:ring-3 focus-within:ring-vc-accent-subtle">
              <Mail className="h-4 w-4 shrink-0 text-vc-tertiary" strokeWidth={1.5} />
              <Input
                id="save-email"
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="name@company.com"
                data-testid="input-save-email"
                className="h-[38px] flex-1 border-0 bg-transparent px-0 text-caption shadow-none focus-visible:ring-0"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-caption font-medium text-vc-primary" htmlFor="save-password">
              Password
            </label>
            <div className="flex items-center gap-2.5 rounded-md border border-vc-default bg-background px-3 focus-within:border-vc-accent focus-within:ring-3 focus-within:ring-vc-accent-subtle">
              <Lock className="h-4 w-4 shrink-0 text-vc-tertiary" strokeWidth={1.5} />
              <Input
                id="save-password"
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="Create a password"
                data-testid="input-save-password"
                className="h-[38px] flex-1 border-0 bg-transparent px-0 text-caption shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {PASSWORD_RULES.map((rule, i) => (
                <div
                  key={rule.label}
                  className={cn(
                    "flex items-center gap-1.5 text-label",
                    rulesMet[i] ? "text-positive" : "text-vc-tertiary",
                  )}
                >
                  {rulesMet[i] ? (
                    <Check className="h-3 w-3" strokeWidth={1.75} />
                  ) : (
                    <span className="h-3 w-3 rounded-full border border-vc-default" />
                  )}
                  {rule.label}
                </div>
              ))}
            </div>
          </div>
          {submitError ? (
            <p className="text-caption text-destructive" role="alert">
              {submitError}
            </p>
          ) : null}
          <Button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="h-10 w-full justify-center gap-2"
            data-testid="button-create-account"
          >
            {submitting ? "Creating account…" : "Create account"}
          </Button>
          <p className="text-center text-caption text-vc-tertiary">
            Already have an account?{" "}
            <a href="/login" className="text-vc-accent">
              Sign in
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
