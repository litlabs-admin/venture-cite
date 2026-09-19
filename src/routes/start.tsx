import { createFileRoute, useSearch } from "@tanstack/react-router";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { startSearchSchema } from "./-shared/searchSchemas";

// Public, pre-account onboarding entry point. Deliberately NOT nested under
// `_app` (auth-gated) - this route runs before sign-up, over the anonymous
// session described in docs/superpowers/specs/2026-09-18-onboarding-data-contract.md.
// `?domain=x` prefills and auto-starts the flow.
export const Route = createFileRoute("/start")({
  validateSearch: startSearchSchema,
  head: () => ({
    meta: [
      { title: "See your AI visibility - VentureCite" },
      {
        name: "description",
        content:
          "Enter your website and see how ChatGPT, Claude, Gemini, Perplexity, DeepSeek and Grok answer for your brand.",
      },
    ],
  }),
  component: StartRoute,
});

function StartRoute() {
  const { domain } = useSearch({ from: "/start" });
  return <OnboardingFlow initialDomain={domain} />;
}
