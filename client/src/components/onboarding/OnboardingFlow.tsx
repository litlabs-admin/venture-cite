// Orchestrates the six-step anonymous onboarding flow. Mounted by the /start
// route (src/routes/start.tsx). Drives useOnboardingSession for all
// server-derived state and keeps only per-step form state locally.
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useOnboardingSession } from "@/hooks/useOnboardingSession";
import { validateDomain } from "@shared/validateDomain";
import { PROBE_PROMPT_COUNT, type Profile } from "@shared/onboarding/session";
import { Enter, StepProgress } from "./shared";
import { WebsiteStep, ScanStep, WhoStep, BrandStep, FirstReadStep, SaveStep } from "./LeftSteps";
import {
  EnginesPreview,
  ReadinessPreview,
  ProbePreview,
  WorkspacePreview,
  FirstReadPreview,
  SavePreview,
} from "./RightPreviews";

export function OnboardingFlow({ initialDomain }: { initialDomain?: string }) {
  const session = useOnboardingSession();
  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState(initialDomain ?? "");
  const [domainError, setDomainError] = useState<string | null>(null);
  const [audience, setAudience] = useState<"own" | "client" | null>(null);
  const [agencyName, setAgencyName] = useState("");
  const [profileEdits, setProfileEdits] = useState<Partial<Profile>>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [autoStarted, setAutoStarted] = useState(false);

  // Resuming an existing session (reload) lands past step 0.
  useEffect(() => {
    if (session.sessionId && step === 0 && (session.site || session.profile)) {
      setStep(session.profile ? 2 : 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionId]);

  // Scan ends the instant `profile` arrives (per the data contract: "Scan
  // ends once profile arrives. The rest keeps running while the user is on
  // Who and Brand.").
  useEffect(() => {
    if (step === 1 && session.profile) setStep(2);
  }, [step, session.profile]);

  // /start?domain=x auto-starts.
  useEffect(() => {
    if (initialDomain && !autoStarted && !session.sessionId) {
      setAutoStarted(true);
      void handleStartScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDomain, autoStarted]);

  async function handleStartScan() {
    const v = validateDomain(domain);
    if (!v.valid) {
      setDomainError(v.reason);
      return;
    }
    setDomainError(null);
    const id = await session.start(v.normalized);
    if (id) setStep(1);
  }

  function handleRetryScan() {
    void handleStartScan();
  }

  async function handleWhoSubmit() {
    if (!audience) return;
    const result = await session.submitAnswers({
      audience,
      agencyName: audience === "client" ? agencyName.trim() : undefined,
    });
    if (result.ok) setStep(3);
  }

  async function handleBrandContinue() {
    if (Object.keys(profileEdits).length > 0 && audience) {
      await session.submitAnswers({
        audience,
        agencyName: audience === "client" ? agencyName.trim() : undefined,
        profile: profileEdits,
      });
    }
    setStep(4);
  }

  function handleChangeDomain() {
    session.reset();
    setStep(0);
    setDomain("");
    setAudience(null);
    setAgencyName("");
    setProfileEdits({});
  }

  async function handleRegister() {
    setRegisterSubmitting(true);
    setRegisterError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firstName: "",
          lastName: "",
          onboardingSessionId: session.sessionId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Registration failed (${res.status})`);
      }
      setSent(true);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegisterSubmitting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setResending(false);
    }
  }

  function handleBack() {
    setStep((s) => (s === 2 ? 0 : Math.max(0, s - 1)));
  }

  const brandName = session.profile?.name ?? session.site?.domain ?? domain;
  const favicon = session.site?.faviconUrl ?? "";
  const scanError = session.errors.site ?? session.errors.profile ?? null;

  let left: React.ReactNode;
  let right: React.ReactNode;
  let showBack = step > 0;

  switch (step) {
    case 0:
      left = (
        <WebsiteStep
          domain={domain}
          onDomainChange={(v) => {
            setDomain(v);
            setDomainError(null);
          }}
          onSubmit={handleStartScan}
          submitting={session.creating}
          error={domainError ?? session.createError}
        />
      );
      right = <EnginesPreview />;
      showBack = false;
      break;
    case 1:
      left = (
        <ScanStep
          domain={domain || session.site?.domain || ""}
          loadingLines={session.loadingLines}
          errorMessage={scanError}
          onRetry={handleRetryScan}
        />
      );
      right = <ReadinessPreview site={session.site} readiness={session.readiness} />;
      break;
    case 2:
      left = (
        <WhoStep
          brandName={brandName}
          domain={session.site?.domain ?? domain}
          favicon={favicon}
          audience={audience}
          agencyName={agencyName}
          onAudienceChange={setAudience}
          onAgencyNameChange={setAgencyName}
          onSubmit={handleWhoSubmit}
          submitting={false}
        />
      );
      right =
        audience === "client" ? (
          <WorkspacePreview agencyName={agencyName} site={session.site} />
        ) : (
          <ProbePreview
            probeTested={session.probe?.promptsTested ?? 0}
            prompts={session.topics?.flatMap((t) => t.prompts) ?? []}
          />
        );
      break;
    case 3:
      left = (
        <BrandStep
          brandName={brandName}
          domain={session.site?.domain ?? domain}
          favicon={favicon}
          profile={session.profile ? { ...session.profile, ...profileEdits } : null}
          competitors={session.competitors}
          isClient={audience === "client"}
          onLooksRight={handleBrandContinue}
          onChangeDomain={handleChangeDomain}
          onEditProfile={(patch) => setProfileEdits((p) => ({ ...p, ...patch }))}
        />
      );
      right = <ReadinessPreview site={session.site} readiness={session.readiness} />;
      break;
    case 4:
      left = (
        <FirstReadStep
          brandName={brandName}
          favicon={favicon}
          probe={session.probe}
          probeError={session.errors.probe ?? null}
          prompts={(session.topics?.flatMap((t) => t.prompts) ?? []).slice(0, PROBE_PROMPT_COUNT)}
          insight={session.insight}
          insightError={session.errors.insight ?? null}
          onContinue={() => setStep(5)}
        />
      );
      right = (
        <FirstReadPreview
          brandName={brandName}
          site={session.site}
          competitors={session.competitors}
          probe={session.probe}
          sources={session.sources}
        />
      );
      break;
    case 5:
    default:
      left = (
        <SaveStep
          brandName={brandName}
          topics={session.topics}
          promptsTested={session.probe?.promptsTested ?? 0}
          email={email}
          password={password}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSubmit={handleRegister}
          submitting={registerSubmitting}
          submitError={registerError}
          sent={sent}
          onResend={handleResend}
          resending={resending}
        />
      );
      right = <SavePreview site={session.site} topics={session.topics} />;
      break;
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-background lg:grid-cols-2">
      <div className="flex flex-col">
        <div className="flex h-[72px] items-center gap-2.5 px-6 lg:px-10">
          <BrandLogo imgClassName="h-5 w-auto" />
        </div>
        <div className="flex flex-1 items-center px-6 pb-12 lg:px-[140px]">
          <div className="flex w-full max-w-[440px] flex-col gap-7">
            <StepProgress step={step} />
            <Enter key={step}>{left}</Enter>
            {showBack && !sent ? (
              <button
                type="button"
                onClick={handleBack}
                className="flex w-fit items-center gap-1.5 text-caption text-vc-tertiary"
                data-testid="button-onboarding-back"
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                Back
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="relative hidden items-center justify-center border-l border-vc-default bg-vc-muted lg:flex">
        <a
          href="/login"
          className="absolute right-8 top-5 flex h-8 items-center rounded-md px-3 text-caption font-medium text-vc-primary"
        >
          Sign in
        </a>
        <Enter key={`right-${step}`}>{right}</Enter>
      </div>
    </div>
  );
}
