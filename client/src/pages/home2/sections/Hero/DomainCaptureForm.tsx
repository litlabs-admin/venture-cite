import { useState } from "react";
import { GlobeIcon, ArrowRightIcon } from "./icons";

// Verbatim from _reference/index.html lines 916-921 (#landing-hero-domain
// form). There is no instant-audit endpoint behind this — submit just sends
// you to signup, same as every other CTA on the page. The submit button
// mirrors the source's disabled="" resting state: disabled until the input
// has a value.
export function DomainCaptureForm() {
  const [domain, setDomain] = useState("");

  return (
    <form
      className="relative flex items-center max-[359px]:flex-col max-[359px]:items-stretch bg-tk-surface border border-tk-default rounded hover:border-tk-accent/40 focus-within:border-tk-accent focus-within:ring-2 focus-within:ring-tk-accent/10 transition-all duration-200 p-1"
      onSubmit={(e) => {
        e.preventDefault();
        window.location.href = "/register";
      }}
    >
      <label htmlFor="landing-hero-domain" className="sr-only">
        Brand domain
      </label>
      <div className="flex-1 relative max-[359px]:w-full">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4">
          <GlobeIcon className="w-4 h-4 text-tk-text-muted" />
        </div>
        <input
          id="landing-hero-domain"
          placeholder="yourbrand.com"
          spellCheck={false}
          inputMode="url"
          autoComplete="url"
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="w-full h-9 pl-9 pr-2 text-[14px] text-tk-primary placeholder:text-tk-tertiary bg-transparent focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={domain.length === 0}
        className="flex-shrink-0 h-9 px-4 rounded bg-tk-accent-subtle text-tk-accent text-[13px] font-medium hover:bg-tk-accent hover:text-white disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:bg-tk-accent-subtle disabled:hover:text-tk-accent transition-colors duration-150 flex items-center gap-1.5 max-[359px]:w-full max-[359px]:justify-center max-[359px]:mt-1"
      >
        <span>Track my brand</span>
        <ArrowRightIcon size={14} />
      </button>
    </form>
  );
}
