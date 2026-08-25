# VentureCite product

VentureCite helps a team work on how AI systems describe and cite its brands.

## Main functions

Users can create brands and select one brand for the current workspace.

Users can create prompts and run citation checks. The application stores runs, results, cited URLs, and related metrics.

Users can inspect AI visibility, citations, competitors, trends, perception, and site health.

Users can create articles and community posts. The application can generate and revise content through configured AI services.

Users can create a brand fact sheet from supplied or discovered source pages. The fact-sheet tools keep facts, sources, conflicts, and scrape runs.

Users can manage settings, notification preferences, account deletion, onboarding, and guided tours.

The pricing page lists Pro and Agency plans. The application also accepts enterprise enquiries.

## Access model

The application authenticates API users with a Supabase Bearer token.

The server checks brand ownership before it returns or changes brand data.

The server stores subscription state and limits. Stripe webhooks update paid access.

## Known release limits

The application must have valid Stripe products and prices before self-service billing can work.

The application sends email through Resend when it has configuration. The test suite does not prove real message delivery.
