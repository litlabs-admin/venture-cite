import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "out/**",
      "coverage/**",
      "server/public/**",
      "*.tsbuildinfo",
      "drizzle/**",
      ".husky/**",
      // Local vendored tool/skill caches — not project source, never lint
      // (also gitignored). Their browser/UMD bundles otherwise flood the
      // report and break lint-staged if accidentally staged.
      ".agents/**",
      ".codex/**",
      // Standalone Next.js reference build for the /home2 marketing page. It
      // has its own toolchain (Next lint rules this config can't resolve) and
      // its own node_modules/.next; linting it here yields tens of thousands
      // of bogus findings. The ported copy in client/src/pages/home2 IS linted.
      "trakkr.ai/**",
    ],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript rules
  ...tseslint.configs.recommended,

  // React rules — only for client/
  {
    files: ["client/**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // The codebase ships unescaped apostrophes/quotes in copy. They render
      // fine and don't affect behavior. Track as warnings; don't gate CI.
      "react/no-unescaped-entities": "warn",
      "react/no-unknown-property": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },

  // Server / shared / scripts — Node globals
  {
    files: ["server/**/*.ts", "shared/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Server is allowed console.log for now (replaced by pino in Wave 0.2)
      "no-console": "off",
      // Guardrail: never run user-auth (session-minting) calls on the
      // service-role client. supabase-js stores the returned session on the
      // calling client and then uses the user's JWT — not the service key —
      // as the Authorization header, so the next Storage/PostgREST call loses
      // service_role and fails RLS ("new row violates row-level security
      // policy"). Use supabaseAuth (server/lib/supabaseAuth.ts) instead.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.object.name='supabaseAdmin'][callee.object.property.name='auth'][callee.property.name='signInWithPassword']",
          message:
            "Do not call signInWithPassword on supabaseAdmin — it poisons the service-role client's Authorization header and breaks service-role Storage/PostgREST with RLS errors. Use supabaseAuth from server/lib/supabaseAuth.ts.",
        },
        {
          selector:
            "CallExpression[callee.object.object.name='supabaseAdmin'][callee.object.property.name='auth'][callee.property.name='setSession']",
          message:
            "Do not call setSession on supabaseAdmin — it poisons the service-role client. Use supabaseAuth from server/lib/supabaseAuth.ts.",
        },
      ],
    },
  },

  // Tests — Vitest globals + relaxed rules
  {
    files: ["tests/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  // Project-wide overrides — pragmatic for a codebase that didn't have
  // ESLint until now. Tighten gradually.
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-escape": "warn",
      "prefer-const": "warn",
    },
  },

  // Prettier — must come last to disable conflicting style rules
  prettier,
);
