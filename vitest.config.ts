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
    // happy-dom globally — keeps server tests fast.
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "tests/**/*.spec.ts"],
    exclude: ["node_modules", "dist", "build", "coverage"],
    setupFiles: ["./tests/setup.ts"],
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
