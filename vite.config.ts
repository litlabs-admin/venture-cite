import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

// Nitro auto-detects its build preset from process.env.VERCEL (proven with
// real builds, see scratchpad/p2/api-unknowns-resolved.md and
// scratchpad/p2/phase3-deploy-audit.md §2/§6). The `vercel` preset hardcodes
// its own output location (`.vercel/output`, required by Vercel's Build
// Output API) and must be left alone. Every other preset (no env var ->
// `node-server`, `RENDER` -> `render-com`) falls back to Nitro's default
// `output.dir`, which is `{{rootDir}}/.output` - and `rootDir` here defaults
// to this file's own `root: client/` below, so an unpinned build lands
// static assets at `client/.output/public` while server/vite.ts's
// serveStatic() reads from `dist/public`. Pinning `output.dir` to `dist`
// for non-Vercel builds keeps publicDir/serverDir resolving underneath it
// (`dist/public`, `dist/server`), matching this file's own `build.outDir`
// below and what serveStatic() expects - fixing the split without touching
// the separate, larger decision of running Nitro's own generated server as
// the production entry point instead of server/index.ts (which currently
// owns scheduler/autopilot-resume/Stripe boot side effects that
// the Nitro entry point does not call; see server/vite.ts for the rest of
// this decision, including a real gap this does NOT fix: `vite build` with
// tanstackStart()+nitro() active never emits a static dist/public/index.html
// at all, build/entry-point details notwithstanding - Nitro treats HTML as
// something it renders, not something it writes to disk. See server/vite.ts).
const isVercelBuild = !!process.env.VERCEL;

// Source-map upload to Sentry runs only when the auth token is present
// (i.e. on Vercel prod/preview builds where SENTRY_AUTH_TOKEN is set).
// Local builds without the token skip upload silently - you still get
// `.map` files in dist/ but they aren't sent anywhere.
const sentryPlugin =
  isProd && process.env.SENTRY_AUTH_TOKEN
    ? sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        // Picked up by the SDK as the release identifier when the build
        // env sets SENTRY_RELEASE (Vercel: $VERCEL_GIT_COMMIT_SHA).
        release: process.env.SENTRY_RELEASE ? { name: process.env.SENTRY_RELEASE } : undefined,
      })
    : null;

export default defineConfig({
  plugins: [
    // Nitro is a sibling plugin, not an option on tanstackStart(). No
    // `preset` is set here on purpose - Nitro auto-detects the target at
    // build time (no env -> node-server for Render, VERCEL=1 -> vercel),
    // so one config targets both hosts. See scratchpad/p2/api-unknowns-resolved.md.
    //
    // DELIBERATELY no `rootDir` here. Passing `nitro({ rootDir: <repo root> })`
    // makes Nitro correctly auto-detect Start's SSR entry (proven: real SSR
    // HTML, not a static template) - but it ALSO makes Nitro's dev-time
    // request handling intercept every request inside the existing app's
    // own Express+Vite middlewareMode dev server (server/vite.ts), returning
    // Start's 404 for wouter routes it doesn't know about (e.g. `/`, `/login`)
    // instead of ever reaching the existing SPA fallback. Left unset (the
    // default, effectively `client/`), that conflict disappears and `npm run
    // dev` is unaffected - but Nitro then silently serves `client/index.html`
    // as a static template instead of running Start's SSR at all (HTTP 200,
    // no error, wrong content). Both states were verified with real curl
    // output; see the Task 2 report for the full repro and why this is
    // flagged as a plan-level decision rather than resolved here.
    nitro({
      // `rootDir` must point at the REPO root, not Vite's `root` (`client/`).
      // Two things depend on it:
      //   1. Nitro finds Start's SSR entry and actually server-renders. Left
      //      unset it silently serves a static template instead - HTTP 200,
      //      no error, wrong content.
      //   2. `output.dir` defaults to `{{rootDir}}/.output`, so pinning
      //      rootDir here is also what keeps the build out of
      //      `client/.output/public` and in `dist/`.
      // Task 2 originally left this unset because Nitro's request handling
      // then intercepted every request in the existing wouter dev server and
      // returned Start's 404 for routes it did not know (`/`, `/login`).
      // That conflict was a consequence of wouter still owning routing; with
      // Start owning the route table, Nitro handling every request is the
      // intended behaviour rather than a collision.
      rootDir: import.meta.dirname,
      // Static files live in `client/public` (Vite's `root` is `client/`), but
      // `rootDir` above points at the REPO root, so Nitro would otherwise look
      // for them in `<repo>/public` - which does not exist - and ship a
      // `dist/public` containing only hashed `assets/`.
      //
      // This is not cosmetic: `robots.txt`, `sitemap.xml` and `llms.txt` live
      // here, and they are exactly what crawlers fetch. Losing them would
      // defeat the reason this migration exists, and would do so silently -
      // the build succeeds and the app looks fine in a browser.
      // `maxAge: 0` because these are stable, unhashed filenames served at
      // fixed URLs - robots.txt and sitemap.xml in particular must be
      // re-fetchable, since a long-lived cache would pin crawlers to a stale
      // sitemap after new content ships. The hashed files under `assets/` are
      // cached separately by Nitro's own build-asset handling.
      publicAssets: [{ dir: path.resolve(import.meta.dirname, "client", "public"), maxAge: 0 }],
      // Vercel-preset settings. These live here, NOT in vercel.json: Nitro's
      // vercel preset emits its own Build Output API tree
      // (.vercel/output/config.json + functions/*.func/.vc-config.json) and
      // never reads root vercel.json, so anything left there is silently
      // ignored once this preset runs.
      //
      // Both values below were previously in vercel.json's `functions` block
      // and would otherwise have been LOST in this migration:
      //   - maxDuration 60: scans and LLM calls routinely exceed Vercel's
      //     10s default. Losing it means production timeouts, not an error
      //     anyone would see at build time.
      //   - memory 1024: matches what the app was provisioned with before.
      //
      // `crons` moved here for the same reason. It is declared ONLY here -
      // deliberately not duplicated in vercel.json, since a cron honoured
      // from both sources would run the daily orchestrator twice.
      // 🔴 UNVERIFIED WITHOUT A REAL DEPLOY: that Vercel picks crons up from
      // config.json for a Build Output API deployment. Confirm in the
      // dashboard's Cron Jobs tab after the first deploy - see
      // docs/deploy-runbook.md.
      vercel: {
        functions: { maxDuration: 60, memory: 1024 },
        config: {
          // Build Output API config version - required by the type, and `3`
          // is the version Nitro's vercel preset emits. Nitro merges this
          // object into the `config.json` it generates, so this only adds
          // `crons`; it does not replace the routes/filesystem entries.
          version: 3,
          crons: [{ path: "/api/cron/daily-orchestrator", schedule: "0 6 * * *" }],
        },
      },
      // This Nitro startup plugin runs the in-process cron scheduler,
      // autopilot resume, and Stripe setup
      // exactly once when Nitro's own generated server boots, so Render
      // doesn't silently lose them now that server/index.ts is no longer
      // the production entry point. No-ops on Vercel and outside
      // NODE_ENV=production; see server/nitroBoot.ts for the full
      // reasoning and proof of "runs once per process, not per request".
      plugins: [
        path.resolve(import.meta.dirname, "server/nitroBoot.ts"),
        // Strips If-None-Match/If-Modified-Since before routing. See that file:
        // a 304 cannot be constructed as a Response with a body, so any
        // conditional request became a 500.
        path.resolve(import.meta.dirname, "server/nitroConditionalRequests.ts"),
      ],
      ...(isVercelBuild
        ? {}
        : {
            output: {
              dir: path.resolve(import.meta.dirname, "dist"),
            },
          }),
    }),
    tailwindcss(),
    // TanStack Start replaces the existing wouter router.
    // SPA (see server/vite.ts) without replacing it yet. Route migration
    // starts in a later task. tanstackStart() MUST come before react() -
    // it registers the dev-time React Refresh preamble react() provides.
    // routes/generated route tree live in a NEW top-level `src/` directory
    // (sibling to `client/`), not under `client/src` - Vite's `root` below
    // stays pinned to `client` for the existing app. srcDirectory must be
    // a RELATIVE path here: an absolute path breaks start-plugin-core's
    // entry resolution, which joins root + srcDirectory with pathe's
    // `join()` (mishandles an absolute 2nd segment) rather than
    // `path.resolve()` (which the routesDirectory/generatedRouteTree
    // computation elsewhere in the same package correctly uses). `"../src"`
    // resolves correctly under both.
    tanstackStart({
      srcDirectory: "../src",
    }),
    react({
      babel: {
        // Strip data-testid attributes from production bundles. They're
        // useful for tests but pure bloat in the shipped JS.
        plugins: isProd
          ? [["babel-plugin-jsx-remove-data-test-id", { attributes: ["data-testid"] }]]
          : [],
      },
    }),
    ...(sentryPlugin ? [sentryPlugin] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "client", "src", "assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  css: {
    // v4 styling runs entirely through the @tailwindcss/vite plugin above,
    // not PostCSS - postcss.config.js was deleted for that reason. But
    // Vite's postcss-load-config still walks UP the filesystem looking for
    // one, and this worktree lives nested under the main checkout, which
    // still has its own (Tailwind v3) postcss.config.js. Left unset, that
    // ancestor config gets picked up and the build resolves the wrong
    // tailwindcss major version. An explicit empty inline config stops the
    // upward search.
    postcss: {},
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Declared browser floor.
    //
    // Without this Vite picks its own default and the output silently
    // tracks whatever is current, so the floor moves every time the
    // toolchain updates and nobody finds out until a visitor reports a
    // blank page. Declaring it makes the floor a decision instead of a
    // side effect.
    //
    // Chosen by measuring rather than by picking a device: builds at
    // safari15 / safari13 / safari12 came out at 21904 / 21960 / 22028 KB
    // of assets. Going as low as esbuild can take us costs 0.5%, so there
    // is no reason to stop higher. Set the floor where it stops being
    // free, not where the last bug report came from.
    //
    // What this does and does not cover:
    //   - SYNTAX is downleveled by esbuild. Verified: the logical
    //     assignment operators (??=, ||=, &&=) that shipped 46 times in
    //     the previous production bundle now compile out entirely.
    //   - RUNTIME APIs are not. esbuild rewrites syntax, not library
    //     calls, and does not inject polyfills. Dependencies calling a
    //     newer method still need the browser to provide it. There are
    //     two such calls today and __root.tsx defines them; a future
    //     dependency can add a third silently. The hydration watchdog in
    //     __root.tsx is what makes that non-fatal - it detects a failed
    //     hydration whatever the cause, so an unpolyfilled API degrades
    //     the page instead of blanking it. See @vitejs/plugin-legacy if
    //     this ever needs to be airtight rather than merely safe.
    //   - CSS is untouched by this setting. Tailwind v4 emits color-mix()
    //     and oklch() by design, so Safari below 16.4 degrades visually
    //     no matter what is set here.
    target: ["safari12", "chrome87", "firefox78", "edge88"],
    // 'hidden' generates .map files but does NOT reference them in the
    // emitted JS via sourceMappingURL comments. The Sentry plugin uploads
    // them to Sentry; browsers never download them, so they're not
    // exposed publicly. Required for prod Sentry stack traces to be
    // readable instead of minified gibberish.
    sourcemap: isProd ? "hidden" : false,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
