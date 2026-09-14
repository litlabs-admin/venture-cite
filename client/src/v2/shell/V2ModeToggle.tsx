import type { V2Mode } from "@/v2/contracts/shell";

const MODE_OPTIONS: V2Mode[] = ["guided", "expert"];

export function V2ModeToggle({
  mode,
  onChange,
}: {
  mode: V2Mode;
  onChange: (mode: V2Mode) => void;
}) {
  return (
    <div
      aria-label="Mode"
      className="grid grid-cols-2 gap-0.5 rounded-[7px] border border-[var(--v2-line)] bg-[var(--v2-inset)] p-0.5"
      role="group"
    >
      {MODE_OPTIONS.map((option) => {
        const selected = mode === option;
        const label = option === "guided" ? "Guided" : "Expert";
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            className={`rounded-[5px] px-2.5 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--v2-brand)] ${
              selected
                ? "bg-[var(--v2-paper)] text-[color:var(--v2-brand)] shadow-sm"
                : "text-[color:var(--v2-ink3)] hover:text-[color:var(--v2-ink)]"
            }`}
            onClick={() => onChange(option)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
