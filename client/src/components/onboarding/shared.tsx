// Shared primitives for the six onboarding steps and their preview panels.
// Visual reference: build2.py (see the task brief) and the rendered PNGs
// under scratchpad/canvas/out/preview/*.png. Colors and sizes come from
// client/src/index.css tokens, never raw hex - build2.py's own header maps
// every hex it uses back to one of these tokens.
import type { ReactNode } from "react";
import { Loader2, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Engine } from "@shared/onboarding/session";

export const STEP_NAMES = ["Website", "Scan", "Who", "Brand", "First read", "Save"] as const;

const ENGINE_ICON: Record<Engine, string> = {
  ChatGPT: "chatgpt.svg",
  Claude: "claude.svg",
  Gemini: "gemini.svg",
  Perplexity: "perplexity.svg",
  DeepSeek: "deepseek.svg",
  Grok: "grok.svg",
};

export function EngineIcon({ engine, size = 16 }: { engine: Engine; size?: number }) {
  return (
    <img
      src={`/venturecite/images/ai-logos/${ENGINE_ICON[engine]}`}
      alt={engine}
      width={size}
      height={size}
      className="shrink-0 object-contain"
    />
  );
}

export function Favicon({
  src,
  size = 16,
  radius = 4,
}: {
  src: string;
  size?: number;
  radius?: number;
}) {
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: radius }}
      className="shrink-0 object-contain"
      // No favicon for this domain: keep the slot so rows stay aligned.
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}

// 220ms quiet-enter animation from build2.py's `.enter` class, honoring
// prefers-reduced-motion (collapses to an 80ms opacity fade, no translate).
export function Enter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1 duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:slide-in-from-bottom-0 motion-reduce:duration-[80ms]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StepProgress({ step }: { step: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex justify-between font-mono text-label tabular-nums text-vc-tertiary">
        <span>Step {step + 1} of 6</span>
        <span>{STEP_NAMES[step]}</span>
      </div>
      <div className="flex gap-1">
        {STEP_NAMES.map((name, i) => (
          <div
            key={name}
            className={cn(
              "h-[3px] flex-1 rounded-sm",
              i <= step ? "bg-vc-accent" : "bg-vc-default",
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function StepHeading({ title, sub }: { title: ReactNode; sub: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-page font-semibold leading-tight tracking-tight text-vc-primary text-balance">
        {title}
      </h1>
      <p className="text-caption leading-relaxed text-vc-secondary text-pretty">{sub}</p>
    </div>
  );
}

export function BrandLine({
  favicon,
  brandName,
  domain,
  showName = true,
}: {
  favicon: string;
  brandName?: string;
  domain: string;
  showName?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Favicon src={favicon} size={20} radius={5} />
      {showName && brandName ? (
        <span className="text-ui font-semibold text-vc-primary">{brandName}</span>
      ) : null}
      <span className="text-caption text-vc-tertiary">{domain}</span>
    </div>
  );
}

export function PreviewCard({ children, width = 400 }: { children: ReactNode; width?: number }) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-vc-default bg-background shadow-[0_1px_2px_rgba(28,25,23,0.06),0_14px_36px_-28px_rgba(28,25,23,0.28)]"
      style={{ width }}
    >
      {children}
    </div>
  );
}

export function CardHead({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-vc-default px-4 py-3">
      {left}
      {right}
    </div>
  );
}

export function Row({
  children,
  height = 40,
  last = false,
}: {
  children: ReactNode;
  height?: number;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4",
        !last && "border-b border-vc-muted",
      )}
      style={{ height }}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wide text-vc-label">
      {children}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-label tabular-nums text-vc-tertiary", className)}>
      {children}
    </span>
  );
}

export function StatusDot({ state }: { state: "done" | "working" | "todo" }) {
  if (state === "done")
    return <Check className="h-3.5 w-3.5 shrink-0 text-positive" strokeWidth={1.75} />;
  if (state === "working")
    return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-vc-primary" />;
  return <Circle className="h-3.5 w-3.5 shrink-0 text-vc-default" strokeWidth={1.5} />;
}

/** A section whose producer sent a step_error: honest "unavailable", never a guess. */
export function UnavailableNotice({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-vc-default bg-vc-muted px-4 py-3">
      <span className="text-caption font-medium text-vc-primary">
        This is unavailable right now
      </span>
      <span className="text-label text-vc-tertiary">{message}</span>
    </div>
  );
}

export function SkeletonRow({ height = 40 }: { height?: number }) {
  return (
    <div className="flex items-center gap-3 border-b border-vc-muted px-4" style={{ height }}>
      <div className="h-3 w-3/5 animate-pulse rounded bg-vc-muted" />
    </div>
  );
}
