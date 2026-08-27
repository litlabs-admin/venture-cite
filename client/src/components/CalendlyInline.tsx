import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

// Calendly's inline scheduler.
//
// Calendly's own snippet is a bare <div> plus a <script async>. Pasted into a
// React tree that mounts and unmounts (this lives in a Dialog), that snippet
// misbehaves in two ways worth handling explicitly:
//
//   1. The script tag would be re-added on every open. Calendly's widget.js
//      is idempotent-ish but re-parsing it each time is wasteful and has been
//      observed to double-render the iframe. So the tag is added ONCE, keyed
//      off its src, and deliberately NOT removed on unmount - other mounts may
//      still need it and re-fetching costs a round trip.
//   2. The script only scans for .calendly-inline-widget when it initialises.
//      A widget mounted AFTER load (opening the dialog a second time) is never
//      picked up, so the box renders empty. When window.Calendly already
//      exists we call initInlineWidget ourselves instead of waiting.
//
// The container is also cleared on unmount: Calendly injects an iframe as a
// child, and React does not know about it, so without this a reopen stacks a
// second iframe under the first.

const SCRIPT_SRC = "https://assets.calendly.com/assets/external/widget.js";

/** Give the third-party script this long before declaring it unavailable. */
const LOAD_TIMEOUT_MS = 12_000;

declare global {
  interface Window {
    Calendly?: {
      initInlineWidget: (opts: { url: string; parentElement: HTMLElement }) => void;
    };
  }
}

export function CalendlyInline({ url, className }: { url: string; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;

    // A blocked script does not always fire `error` - a CSP refusal or a
    // network-level block can leave the element silent, in which case the
    // widget would sit on "Loading the calendar..." forever. Observed exactly
    // that while testing. Time out and show the fallback instead: a visible
    // "email us" is worth more than an eternal spinner.
    const timeout = setTimeout(() => {
      if (!cancelled && !window.Calendly) setFailed(true);
    }, LOAD_TIMEOUT_MS);

    function mount() {
      if (cancelled || !host) return;
      if (window.Calendly) {
        // Clear first: a reopened dialog would otherwise stack iframes.
        host.innerHTML = "";
        window.Calendly.initInlineWidget({ url, parentElement: host });
        clearTimeout(timeout);
        setReady(true);
      }
    }

    if (window.Calendly) {
      mount();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", mount, { once: true });
        existing.addEventListener("error", () => setFailed(true), { once: true });
      } else {
        const script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        script.addEventListener("load", mount, { once: true });
        // A blocked or offline script must say so. Left alone, the user just
        // stares at an empty 700px box with no explanation.
        script.addEventListener("error", () => setFailed(true), { once: true });
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (host) host.innerHTML = "";
    };
  }, [url]);

  if (failed) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-vc-default p-4">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-vc-danger" aria-hidden />
        <p className="text-caption text-vc-secondary">
          The scheduler couldn&apos;t load. Email us at{" "}
          <a className="underline" href="mailto:hello@venturepr.co">
            hello@venturepr.co
          </a>{" "}
          and we&apos;ll find a time.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {!ready && (
        <div className="flex items-center justify-center gap-2 py-10" role="status">
          <Loader2 className="h-4 w-4 animate-spin text-vc-accent" aria-hidden />
          <span className="text-caption text-vc-secondary">Loading the calendar…</span>
        </div>
      )}
      {/* data-url as well as the explicit initInlineWidget call above: the
          script auto-scans for .calendly-inline-widget when it first loads, and
          on that path it reads the URL from this attribute. Supporting both
          means the widget renders whether the script arrives before or after
          this component mounts. */}
      <div
        ref={hostRef}
        className="calendly-inline-widget"
        data-url={url}
        style={{ minWidth: 320, height: ready ? 700 : 0 }}
        data-testid="calendly-inline"
      />
    </div>
  );
}
