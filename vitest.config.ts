import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // React plugin lets vitest transform .tsx files. Server-only tests
  // ignore the JSX transform so this is harmless for them.
  plugins: [react()],
  test: {
    // Default to node for server-side tests (the existing 237 tests).
    // React component tests opt into "happy-dom" via a per-file pragma:
    //   // @vitest-environment happy-dom
    // (set at the top of each .test.tsx file). Cheaper than enabling
    // happy-dom globally - keeps server tests fast.
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "tests/**/*.spec.ts"],
    // tests/e2e/** are Playwright specs - they need a browser and a running
    // server, and vitest cannot execute them. The include glob above matches
    // *.spec.ts, which is Playwright's naming convention here, so they must
    // be excluded explicitly. Run them with `npm run test:e2e`.
    exclude: ["node_modules", "dist", "build", "coverage", "tests/e2e/**"],
    setupFiles: ["./tests/setup.ts"],
    // Runs once per run, before any file loads. Repairs the migration-0112
    // role grants that an interrupted integration run can leave stripped -
    // see tests/globalSetup.ts. A no-op unless TEST_DATABASE_URL points at an
    // approved local Supabase target, so unit-only runs are untouched.
    globalSetup: ["./tests/globalSetup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["server/**/*.ts", "shared/**/*.ts", "client/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/*.d.ts",
        "node_modules",
        "dist",
        "build",
        "server/vite.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./client/src"),
      "@shared": path.resolve(import.meta.dirname, "./shared"),
    },
  },
});
