import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

// Source-map upload to Sentry runs only when the auth token is present
// (i.e. on Vercel prod/preview builds where SENTRY_AUTH_TOKEN is set).
// Local builds without the token skip upload silently — you still get
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
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
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
