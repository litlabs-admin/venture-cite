import { useState } from "react";

// Verbatim from _reference/index.html:3293. The static snapshot only
// captures Monthly as the active pill (bg-accent-subtle text-accent) with
// Annual inactive (text-secondary hover:text-primary) — no second snapshot
// exists showing Annual active, or showing the two plan prices after an
// annual switch. This is therefore built as a simple local-state toggle
// that swaps which pill looks active; it does not swap the card prices,
// since no annual price figures appear anywhere in the source to port.
// AMBIGUITY — see closing report.
export function BillingToggle() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  return (
    <div className="inline-flex p-0.5 sm:p-1 rounded border border-tk-default bg-tk-surface self-start sm:self-auto">
      <button
        type="button"
        onClick={() => setBilling("monthly")}
        className={`px-3 sm:px-4 py-1.5 sm:py-2 text-[12px] sm:text-[13px] font-medium rounded transition-all duration-200 ${
          billing === "monthly"
            ? "bg-tk-accent-subtle text-tk-accent"
            : "text-tk-secondary hover:text-tk-primary"
        }`}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => setBilling("annual")}
        className={`px-3 sm:px-4 py-1.5 sm:py-2 text-[12px] sm:text-[13px] font-medium rounded transition-all duration-200 flex items-center gap-1.5 sm:gap-2 ${
          billing === "annual"
            ? "bg-tk-accent-subtle text-tk-accent"
            : "text-tk-secondary hover:text-tk-primary"
        }`}
      >
        Annual
        <span className="text-[9px] sm:text-[10px] font-semibold tracking-tight px-1 sm:px-1.5 py-0.5 rounded transition-all duration-200 bg-tk-muted text-tk-secondary">
          -17%
        </span>
      </button>
    </div>
  );
}
