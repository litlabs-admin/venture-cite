import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";

const TERMS = [
  {
    id: "geo",
    code: "GEO",
    name: "Generative Engine Optimization",
    definition:
      "Optimizing your content and brand presence so AI assistants like ChatGPT, Claude, and Perplexity cite you when answering user questions.",
    whyItMatters:
      "Increasingly, people get information directly from AI assistants instead of clicking through to websites. If AI engines don't know your brand, you're invisible to a growing slice of demand. GEO is the discipline of being part of those answers.",
    howVentureCiteCovers: [
      "Citation tracking across ChatGPT, Claude, Perplexity, Gemini, DeepSeek",
      "AI-optimized content generation tuned for chunkability and authority signals",
      "GEO Signals scoring + brand fact sheet to reduce hallucinations",
    ],
    relatedPages: [
      { label: "Run citation checks", href: "/citations" },
      { label: "Generate optimized content", href: "/content" },
      { label: "AI Visibility checklist", href: "/ai-visibility" },
    ],
  },
  {
    id: "aeo",
    code: "AEO",
    name: "Answer Engine Optimization",
    definition:
      "Optimizing for systems that give direct answers — Reddit threads, Wikipedia summaries, FAQ snippets — that AI engines often quote verbatim.",
    whyItMatters:
      "Users want answers, not link lists. Answer Engines (and AI summaries built on them) decide what gets surfaced based on signals like discussion engagement, structured FAQs, and authoritative sources. AEO captures attention before users ever reach a search results page.",
    howVentureCiteCovers: [
      "Reddit + forum outreach campaign tooling",
      "FAQ Manager to author + optimize FAQs that AI engines extract verbatim",
      "Listicle scanner to find third-party listicles where you should be featured",
    ],
    relatedPages: [
      { label: "Community outreach", href: "/community" },
      { label: "FAQ Manager", href: "/faq-manager" },
      { label: "GEO Opportunities", href: "/geo-opportunities" },
    ],
  },
  {
    id: "seo",
    code: "SEO",
    name: "Search Engine Optimization",
    definition:
      "Traditional Google/Bing ranking — keywords, backlinks, page speed, content quality, mobile usability — the foundation that GEO and AEO build on.",
    whyItMatters:
      "AI engines crawl the same web SEO has always served. A site that ranks well for SEO is the same site that becomes citation-eligible for AI engines. SEO isn't dying — it's the foundation that GEO/AEO sit on top of.",
    howVentureCiteCovers: [
      "Crawler Check confirms AI crawlers (GPTBot, ClaudeBot, PerplexityBot) are allowed",
      "Schema markup recommendations boost both Google rich-results and AI parsability",
      "Keyword Research surfaces queries AI engines actually answer",
    ],
    relatedPages: [
      { label: "Crawler Check", href: "/crawler-check" },
      { label: "Keyword Research", href: "/keyword-research" },
    ],
  },
] as const;

export default function GlossaryPage() {
  // JSON-LD DefinedTermSet — gives both AI engines (deliciously meta) and
  // Google's structured-data parser a clean machine-readable definition.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name: "GEO vs AEO vs SEO Glossary",
    hasDefinedTerm: TERMS.map((t) => ({
      "@type": "DefinedTerm",
      "@id": `#${t.id}`,
      name: t.name,
      description: t.definition,
      termCode: t.code,
    })),
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      {/* Title/description moved to src/routes/glossary.tsx's `head()` —
          metadata belongs to the route, not this component. The JSON-LD
          script below stays here: it's page-specific structured data, not
          a <title>/<meta> tag, and React 19 doesn't hoist a plain
          <script> the way it hoists <title>/<meta>, so it renders in place
          in the body — out of this task's scope. */}
      {/* JSON-LD schema for AI engines + Google rich-results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="mb-10">
        <h1 className="text-stat font-semibold tracking-tight">GEO vs AEO vs SEO</h1>
        <p className="mt-3 text-ui text-muted-foreground">
          Three optimization disciplines for the AI-first web. They layer — they don't compete.
        </p>
      </header>

      {TERMS.map((term) => (
        <section
          key={term.id}
          id={term.id}
          // scroll-mt-16 ensures anchor jumps don't hide the heading under
          // any sticky header that might exist later.
          className="mb-12 scroll-mt-16"
        >
          <div className="flex items-baseline gap-3 mb-4">
            <h2 className="text-page font-semibold">{term.code}</h2>
            <span className="text-ui text-muted-foreground">{term.name}</span>
          </div>

          <p className="text-foreground mb-3">{term.definition}</p>

          <h3 className="text-caption font-semibold mt-6 mb-2">Why it matters</h3>
          <p className="text-caption text-muted-foreground">{term.whyItMatters}</p>

          <h3 className="text-caption font-semibold mt-6 mb-2">How VentureCite covers it</h3>
          <ul className="space-y-1.5 text-caption text-muted-foreground list-disc list-inside">
            {term.howVentureCiteCovers.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h3 className="text-caption font-semibold mt-6 mb-2">Related pages</h3>
          <ul className="space-y-1">
            {term.relatedPages.map((p) => (
              <li key={p.href}>
                {/* Plain <a>, not wouter's <Link>: wouter's Link reads the
                    default useLocation hook to compute its active state,
                    which touches the global `location` object during
                    render — that throws under SSR (no `location` global in
                    Node) since this page renders outside any wouter
                    <Router ssrPath=...> that could supply a server
                    snapshot. These are outbound links to other top-level
                    routes anyway (not in-page client transitions), so a
                    full navigation is correct regardless. */}
                <a
                  href={p.href}
                  className="inline-flex items-center text-caption text-primary hover:underline"
                >
                  {p.label} <ArrowRight className="h-3 w-3 ml-1" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Card>
        <CardContent className="p-6">
          <h2 className="text-ui font-semibold mb-3">How they layer</h2>
          <p className="text-caption text-muted-foreground">
            Think of SEO as the foundation that determines whether your content can be found at all,
            AEO as the discipline of being chosen as the canonical answer in answer-engine surfaces,
            and GEO as the layer that determines whether AI assistants cite you when they're
            generating responses for users. Doing all three well compounds — neither replaces the
            others.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
