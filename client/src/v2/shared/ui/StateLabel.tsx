import { V2Icon } from "@/v2/theme/V2Icon";
import type { V2IconName } from "@/v2/contracts/icons";
import { cn } from "@/lib/utils";

export type StateLabelState =
  | "verified"
  | "needs-review"
  | "user-confirmation"
  | "not-measured"
  | "failed"
  | "stale"
  | "no-finding";

type StateDefinition = {
  icon: V2IconName;
  word: string;
  tone: "ok" | "brand" | "warn" | "bad" | "neutral";
};

const definitions: Record<StateLabelState, StateDefinition> = {
  verified: { icon: "check", word: "Verified", tone: "ok" },
  "needs-review": { icon: "warn", word: "Needs review", tone: "warn" },
  "user-confirmation": { icon: "q", word: "User confirmation", tone: "brand" },
  "not-measured": { icon: "clock", word: "Not measured", tone: "neutral" },
  failed: { icon: "diag", word: "Failed", tone: "bad" },
  stale: { icon: "cdown", word: "Stale", tone: "warn" },
  "no-finding": { icon: "shield", word: "No finding", tone: "ok" },
};

const toneClasses: Record<StateDefinition["tone"], string> = {
  ok: "text-[color:var(--v2-ok)]",
  brand: "text-[color:var(--v2-brand)]",
  warn: "text-[color:var(--v2-warn)]",
  bad: "text-[color:var(--v2-bad)]",
  neutral: "text-[color:var(--v2-ink3)]",
};

export type StateLabelProps = {
  state: StateLabelState;
  className?: string;
};

export function StateLabel({ state, className }: StateLabelProps) {
  const definition = definitions[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[12.5px] font-semibold",
        toneClasses[definition.tone],
        className,
      )}
      data-state={state}
    >
      <span data-glyph={definition.icon}>
        <V2Icon name={definition.icon} size={14} />
      </span>
      <span>{definition.word}</span>
    </span>
  );
}
