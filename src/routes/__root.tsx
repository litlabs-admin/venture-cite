import type { ReactNode } from "react";
import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ScanCompletionListener } from "@/components/ScanCompletionListener";
import { TourOrchestrator } from "@/tours/engine/TourOrchestrator";
// Global stylesheet. Under the old wouter/index.html entry, this was pulled
// in as a side-effect import from client/src/main.tsx, which sat at the root
// of a SEPARATE Vite module graph (the classic index.html-rooted SPA bundle).
// Phase 2 Task 6a's entry-point flip makes THIS file (src/routes/__root.tsx)
// the true root of every request's document - Start/Nitro's manifest-based
// per-route CSS injection (HeadContent's manifestCssTags) only picks up
// stylesheets reachable from a matched route's own module graph, and nothing
// under src/routes/ previously imported it. Without this import, Start's own
// bundle would ship with zero app CSS (unstyled SSR + unstyled hydrated app)
// even though the legacy client/index.html-rooted bundle still had it.
import "@/index.css";

// Phase 2 Task 6a: mounts what client/src/App.tsx used to mount, now that
// App.tsx's <Switch>/<Route> table has been deleted (src/routes/ is the
// route table). Order matches App.tsx exactly: ErrorBoundary > ThemeProvider
// > QueryClientProvider (reusing the existing queryClient singleton) >
// TooltipProvider > Toaster > ScanCompletionListener > TourOrchestrator >
// page content (Outlet, in place of App.tsx's <Router/>). HelmetProvider is
// NOT ported - react-helmet-async is being removed project-wide; all
// <title>/<meta> now comes from TanStack Router's `head()` route option
// (this route's default below, overridden per-page by src/routes/index.tsx,
// privacy.tsx, glossary.tsx, and a handful of _app/** routes - see the
// comment on `head()` below for why the plain-JSX/React-19-hoisting
// approach was replaced).
//
// SSR-SAFETY NOTE for whoever runs the final gate: __root.tsx renders on the
// server for EVERY route (SSR'd or not - only children below ssr:false
// layouts skip SSR, not the root itself), so ScanCompletionListener and
// TourOrchestrator both run server-side on every request.
// ScanCompletionListener.tsx is client/src/components/** (a sibling task's
// file scope, not this one); TourOrchestrator.tsx is in this task's own
// scope (client/src/tours/**) and was migrated here off
// "@/lib/router-compat" onto "@tanstack/react-router"'s own useRouterState
// (Phase 2 Task 7). Both are SSR-safe as of this session: neither imports
// "wouter" directly anywhere in the tree - wouter's own useLocation has no
// ssrPath configured in this codebase and crashes SSR with "location is not
// defined" the same way glossary.tsx's wouter <Link> did before Task 4 fixed
// it (see that task's report) - and useRouterState reads router state that
// is always populated during SSR, not browser globals. Their other hooks
// (useAuth, useBrandSelection, useTourState, usePersistedState) were also
// read end to end and found SSR-safe: no top-level window/document/
// localStorage access outside useEffect or a try/catch. If either
// component's imports regress back to "wouter" in a later change, this
// becomes a hard SSR crash on all 40 routes, not just the affected page.
export const Route = createRootRoute({
  // Site-wide metadata defaults. This is the ONLY mechanism that renders
  // <title>/<meta>/<link> for this app - TanStack Router's `head()`,
  // rendered exactly once via <HeadContent /> below. There used to be a
  // SECOND mechanism: a raw-JSX block of the same tags rendered directly
  // in RootDocument's <head>, on the theory that "React dedupes by
  // tag+key". That claim was false - React 19 hoists every <title>/<meta>
  // it finds into <head> and does NOT deduplicate them, so every route
  // shipped two <title> tags and two <meta name="description"> tags (the
  // raw-JSX default plus whatever a page component or, now, a route's own
  // `head()` renders). Confirmed on the built server: `curl` against
  // `/privacy` showed 2x each. The block is gone; `head()` is it. Route
  // `head()` results merge across the matched route tree (root → leaf) by
  // `name`/`property`, with the deepest match's value winning per
  // attribute - see node_modules/@tanstack/react-router's
  // headContentUtils.ts. So a page-specific `head()` (src/routes/index.tsx,
  // privacy.tsx, glossary.tsx, and the handful of `_app/**` routes that
  // need their own title) can override any of these defaults without a
  // duplicate tag ever being possible.
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0, maximum-scale=1" },
      { title: "VentureCite - Get recommended by AI engines" },
      {
        name: "description",
        content:
          "VentureCite shows you which brands AI recommends when your buyers ask what to buy, why it picks them over you, and what to publish to get on that list. Across every major AI engine.",
      },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "VentureCite" },
      { property: "og:title", content: "VentureCite - Get recommended by AI engines" },
      {
        property: "og:description",
        content:
          "See which brands AI recommends when your buyers ask, why it picks them, and what it takes to be on that list.",
      },
      { property: "og:url", content: "https://venturecite.com/" },
      { property: "og:image", content: "https://venturecite.com/favicon.png" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "VentureCite - Get recommended by AI engines" },
      {
        name: "twitter:description",
        content:
          "See which brands AI recommends when your buyers ask, why it picks them, and what it takes to be on that list.",
      },
      { name: "twitter:image", content: "https://venturecite.com/favicon.png" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "canonical", href: "https://venturecite.com/" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap",
      },
    ],
    // `head().scripts` renders into <HeadContent/> (via `match.headScripts`)
    // - NOT the body-end `<Scripts/>` used for router hydration - so both
    // of these land in <head>, same position they occupied as raw JSX
    // before. Verified against node_modules/@tanstack/react-router's
    // route.d.ts (`head` return type: `scripts?: AnyRouteMatch['headScripts']`)
    // and Matches.d.ts (`headScripts?: Array<JSX.IntrinsicElements['script']>`)
    // - AND against the actual runtime (Asset.tsx's `Script` component):
    // it reads inline script content off `children` as a plain string, not
    // `dangerouslySetInnerHTML` (a first attempt using
    // `dangerouslySetInnerHTML` silently rendered nothing - `typeof
    // children === "string"` was false - caught by re-curling the built
    // server and finding neither script in the response body).
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(SOFTWARE_APPLICATION_JSON_LD),
      },
      { children: THEME_FOUC_SCRIPT },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <ErrorBoundary>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <Toaster />
              <ScanCompletionListener />
              <TourOrchestrator />
              <Outlet />
            </TooltipProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </RootDocument>
  );
}

// FOUC blocker: apply the right theme class to <html> BEFORE any CSS loads
// or React mounts. Copied verbatim from the inline <script> that used to
// live in client/index.html's <head> (see git history) - that document is
// no longer served once Start owns routing (its own SSR document, rendered
// from this file, replaces client/index.html entirely; confirmed by reading
// @tanstack/react-start-server's renderRouterToStream/StartServer pipeline,
// which has no step that reads or merges client/index.html). Mirrors the
// logic in client/src/lib/theme.ts; kept as a plain string here for the same
// reason it was a plain <script> before - it must run synchronously, before
// hydration, so it cannot be a React-managed side effect.
const THEME_FOUC_SCRIPT = `
(function () {
  // Hydration watchdog.
  //
  // The landing page renders every section at opacity-0 from SSR and only
  // reveals it from a useEffect (Hero's mounted, useScrollReveal's
  // isVisible). So its readability depends on hydration completing. When
  // hydration does not complete the visitor gets a nav bar over an empty
  // white screen - reported from an iPad, but the browser was never the
  // point: a runtime throw in any component, a chunk that 404s after a
  // deploy, a CSP rule, a blocked or stalled network request and a browser
  // too old to parse the bundle all produce the identical blank page.
  //
  // So this does not test for any of those causes. It adds js
  // optimistically, then removes it unless the client entry reports that
  // hydration actually finished (client/src/main.tsx sets hydrated). The
  // CSS in pages/landing/styles.css keys off html:not(.js) and forces the
  // start states visible, so ANY failure to hydrate - known or unknown,
  // present or future - degrades to a static readable page instead of a
  // blank one.
  //
  // Set outside the try below: it must not depend on the theme logic.
  var docEl = document.documentElement;
  docEl.classList.add("js");
  var revealFallback = function () {
    if (!docEl.hasAttribute("data-hydrated")) docEl.classList.remove("js");
  };
  // Two independent triggers, because neither alone covers every case.
  // load fires once subresources settle - the fast path when a script
  // 404s or is blocked outright. The timer covers what load cannot: a
  // script that downloads and parses but throws during hydration, and a
  // load event that never arrives because a request is hanging. 4s is
  // past a slow 3G hydrate and well before a visitor gives up on a blank
  // screen; the fallback is idempotent, so both firing is harmless.
  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", revealFallback);
  }
  setTimeout(revealFallback, 4000);
  // Two runtime APIs esbuild cannot downlevel (it rewrites syntax, not
  // library calls) that dependencies in the client bundle call outright.
  // Both landed in Safari 15.4, so an iPad on 15.0-15.3 throws on the first
  // call and takes hydration with it. Cheaper to define them here, before
  // the bundle loads, than to audit which dependency uses them.
  if (!Object.hasOwn) {
    Object.hasOwn = function (o, k) {
      return Object.prototype.hasOwnProperty.call(o, k);
    };
  }
  if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, "at", {
      value: function (n) {
        n = Math.trunc(n) || 0;
        if (n < 0) n += this.length;
        return n < 0 || n >= this.length ? undefined : this[n];
      },
      writable: true,
      configurable: true,
    });
  }
  try {
    var stored = null;
    try {
      stored = window.localStorage.getItem("vc-theme-v1");
    } catch (e) {
      /* private mode - fall through to system */
    }
    var resolved;
    if (stored === "light" || stored === "dark") {
      resolved = stored;
    } else if (stored === "system") {
      var mql =
        typeof window.matchMedia === "function"
          ? window.matchMedia("(prefers-color-scheme: dark)")
          : null;
      resolved = mql && mql.matches ? "dark" : "light";
    } else {
      // No stored preference: default to light. Must stay in lockstep with
      // getStoredTheme() in client/src/lib/theme.ts, or the first paint and
      // React's hydrated state disagree.
      resolved = "light";
    }
    var root = document.documentElement;
    if (resolved === "dark") root.classList.add("dark");
    root.style.colorScheme = resolved;
  } catch (e) {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  }
})();
`;

// Structured data AI answer engines ingest to describe the product. Copied
// verbatim from client/index.html - see THEME_FOUC_SCRIPT's comment above
// for why it moved here instead of staying in that file.
const SOFTWARE_APPLICATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "VentureCite",
  applicationCategory: "BusinessApplication",
  url: "https://venturecite.com/",
  description:
    "VentureCite is a Generative Engine Optimization (GEO) platform that helps brands get recommended by AI engines. It tracks which brands ChatGPT, Claude, Perplexity, Grok and Gemini recommend when buyers ask what to buy, explains why, and generates the content needed to win a place on that list.",
  offers: { "@type": "Offer", category: "SaaS" },
};

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // suppressHydrationWarning because THEME_FOUC_SCRIPT below deliberately
    // mutates this exact element before React hydrates - it adds `class="dark"`
    // and sets `style.color-scheme`. The server cannot render those: the theme
    // lives in localStorage, which SSR cannot read. React saw attributes it had
    // not emitted and logged a hydration mismatch on every single page load.
    //
    // Suppression is scoped to this element's own attributes only - it does not
    // extend to descendants - so a genuine mismatch anywhere inside the app is
    // still reported. Removing the script instead is not an option: it exists to
    // stop a flash of the wrong theme, and it has to run before first paint.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Every <title>/<meta>/<link>/<script> tag for the document comes
            from route `head()` config (this route's default above, plus any
            page route's override) via <HeadContent/>. Nothing else renders
            into <head> - see the comment on `head()` above for why a second,
            raw-JSX mechanism used to sit here and why it was deleted. */}
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
