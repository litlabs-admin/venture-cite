import { useState } from "react";

// Local copies of the exact lucide-react icon paths seen rendered in
// _reference/index.html for this form (globe, arrow-right). Not imported
// from components/sections/Nav/icons.tsx to avoid any cross-agent edit race
// on that file while Nav/Hero may be worked on concurrently — duplication
// here is intentional and safe for a form this small.
function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

// Static domain-capture form for the Closing CTA (#landing-closing-domain).
// Unlike Hero's form this one is NOT A/B tested — no useExperiment, no
// data-* variant wiring, just a plain static "Get started" CTA label per
// the task brief. The submit button's disabled state in the source snapshot
// (disabled="" with value="") is real form-validation behavior (empty
// input -> disabled submit), not an animation start state, so it's wired
// here as live logic rather than rendered as a permanently-disabled button.
// VentureCite has no live domain-capture backend yet, so submission simply
// routes to /register — same destination as every other CTA on this page.
//
// This is the page's terminal conversion CTA — the same job Hero's form does
// at the top of the page — so it gets the solid --accent tier rather than the
// accent-subtle ghost used for secondary actions.
export function DomainCaptureForm() {
  const [domain, setDomain] = useState("");

  return (
    <form
      className="relative flex items-center bg-vc-surface border border-vc-default rounded hover:border-vc-accent/40 focus-within:border-vc-accent focus-within:ring-2 focus-within:ring-vc-accent/10 transition-all duration-200 p-1"
      onSubmit={(e) => {
        e.preventDefault();
        window.location.href = "/register";
      }}
    >
      <label htmlFor="landing-closing-domain" className="sr-only">
        Brand domain
      </label>
      <div className="flex-1 relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4">
          <GlobeIcon className="lucide lucide-globe w-4 h-4 text-vc-text-muted" />
        </div>
        <input
          id="landing-closing-domain"
          placeholder="yourbrand.com"
          spellCheck={false}
          inputMode="url"
          autoComplete="url"
          className="w-full h-9 pl-9 pr-2 text-[14px] text-vc-primary placeholder:text-vc-tertiary bg-transparent focus:outline-hidden"
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
      </div>
      <button
        type="submit"
        disabled={domain.trim().length === 0}
        className="shrink-0 h-9 px-4 rounded bg-vc-accent text-white text-[13px] font-medium hover:bg-vc-accent-hover disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-vc-accent transition-colors duration-150 flex items-center gap-1.5"
      >
        Get started
        <ArrowRightIcon className="lucide lucide-arrow-right" />
      </button>
    </form>
  );
}
