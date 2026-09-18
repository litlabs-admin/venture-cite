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
      // TanStack Router codegen - its own header says to exclude it from
      // linters and formatters. The plugin rewrites it on every dev-server
      // start, so anything we "fix" here comes straight back.
      "src/routeTree.gen.ts",
      // Vercel build output. `api/_bundle.js` is a generated server bundle,
      // not source: it is gitignored, no config references it, and linting it
      // reported 233 no-undef errors for Node globals - every lint error in
      // the repo came from this one generated file.
      "api/**",
      // Local vendored tool/skill caches - not project source, never lint
      // (also gitignored). Their browser/UMD bundles otherwise flood the
      // report and break lint-staged if accidentally staged.
      ".agents/**",
      ".claude/**",
      ".codex/**",
      // The local Supabase CLI generates these files.
      "supabase/.branches/**",
      "supabase/.temp/**",
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

  // React rules - only for client/
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

  // Server / shared / scripts - Node globals
  {
    files: ["server/**/*.ts", "shared/**/*.ts", "scripts/**/*.ts", "scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // The server currently permits console.log.
      "no-console": "off",
      // Guardrail: never run user-auth (session-minting) calls on the
      // service-role client. supabase-js stores the returned session on the
      // calling client and then uses the user's JWT - not the service key -
      // as the Authorization header, so the next Storage/PostgREST call loses
      // service_role and fails RLS ("new row violates row-level security
      // policy"). Use supabaseAuth (server/lib/supabaseAuth.ts) instead.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.object.name='supabaseAdmin'][callee.object.property.name='auth'][callee.property.name='signInWithPassword']",
          message:
            "Do not call signInWithPassword on supabaseAdmin - it poisons the service-role client's Authorization header and breaks service-role Storage/PostgREST with RLS errors. Use supabaseAuth from server/lib/supabaseAuth.ts.",
        },
        {
          selector:
            "CallExpression[callee.object.object.name='supabaseAdmin'][callee.object.property.name='auth'][callee.property.name='setSession']",
          message:
            "Do not call setSession on supabaseAdmin - it poisons the service-role client. Use supabaseAuth from server/lib/supabaseAuth.ts.",
        },
      ],
    },
  },

  // Ask/Tutor independence (docs/ask-feature/07-integration-and-hardening.md
  // §0). Ask and the AI Tutor share no tables, budget, routes, components or
  // prompts. These two blocks enforce that boundary in both directions so
  // neither product can silently start depending on the other's internals.
  // Platform libraries (ssrf, llmPricing, modelConfig, ownership,
  // SafeMarkdown, agent_tasks/outbox_commands via @shared/schema) belong to
  // neither product and are not restricted here.
  {
    files: [
      "server/ask/**/*.ts",
      "server/routes/ask.ts",
      "client/src/components/ask/**/*.tsx",
      "client/src/hooks/useAskRun.ts",
      "client/src/hooks/useAskThreads.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/chatbotKnowledge*",
                "**/chatbotBudget*",
                "**/chatbotStorage*",
                "**/routes/assistant*",
                "**/hooks/useChatbot*",
                "**/components/chatbot/**",
                "**/components/EducationAssistant*",
                "**/lib/openChatbotPrompt*",
              ],
              message:
                "Ask may not import AI Tutor modules - see docs/ask-feature/07-integration-and-hardening.md §0 (independence decision). Duplicate the small amount of logic you need instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "server/routes/assistant.ts",
      "server/lib/chatbot*.ts",
      "server/storage/chatbotStorage.ts",
      "client/src/hooks/useChatbot.ts",
      "client/src/components/chatbot/**/*.tsx",
      "client/src/components/EducationAssistant.tsx",
      "client/src/lib/openChatbotPrompt.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/server/ask/**",
                "**/routes/ask*",
                "**/hooks/useAskRun*",
                "**/hooks/useAskThreads*",
                "**/components/ask/**",
              ],
              message:
                "The AI Tutor may not import Ask modules - see docs/ask-feature/07-integration-and-hardening.md §0 (independence decision).",
            },
          ],
        },
      ],
    },
  },
  // server/ask/** must stay testable against a scripted ModelClient with
  // zero HTTP (07 §7, "the fake model") - importing express here would mean
  // the loop can no longer run without a live request/response pair.
  {
    files: ["server/ask/**/*.ts"],
    ignores: ["server/ask/stream.ts"], // the one file whose job IS the Express Response type
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "express",
              message:
                "server/ask/** must stay testable against a scripted ModelClient with no HTTP - keep Express types out of the loop/tools/context modules. server/routes/ask.ts is where request/response belongs.",
            },
          ],
        },
      ],
    },
  },

  // Tests - Vitest globals + relaxed rules
  {
    files: ["tests/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
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

  // Project-wide overrides - pragmatic for a codebase that didn't have
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

  // Prettier - must come last to disable conflicting style rules
  prettier,
);
