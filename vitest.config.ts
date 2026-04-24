import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],
    exclude: ["node_modules", "dist", "build", "coverage"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["server/**/*.ts", "shared/**/*.ts", "client/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.ts",
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
