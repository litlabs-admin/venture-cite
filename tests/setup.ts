// Vitest global setup. Runs before every test file.
//
// Adds Testing Library's jest-dom matchers (toBeInTheDocument, toHaveTextContent,
// toBeDisabled, etc.) to vitest's `expect`. Required for any .test.tsx that
// renders React components.
//
// Server-only tests (.test.ts) load this too — it's harmless for them
// because the matchers only fire when DOM elements are passed to expect().
//
// We do NOT load dotenv/config here because tests that use vi.stubEnv /
// vi.unstubAllEnvs expect a clean environment, and dotenv would leak real
// values into those isolation boundaries. Integration tests that need
// DATABASE_URL must `import "dotenv/config"` at the top of their own file.

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Auto-unmount React trees between tests. @testing-library/react's built-in
// auto-cleanup only registers when a global `afterEach` is present, which
// requires `globals: true` in vitest config. We use `globals: false` for
// server-test speed, so we wire cleanup manually here. Harmless for
// non-DOM tests because cleanup() is a no-op when nothing was rendered.
afterEach(() => {
  cleanup();
});
