import { useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";

const TITLE = "GEO vs AEO vs SEO — VentureCite Glossary";
const META_DESCRIPTION =
  "Plain-English definitions of GEO (Generative Engine Optimization), AEO (Answer Engine Optimization), and SEO (Search Engine Optimization), and how they layer.";

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
      "Optimizing for systems that give direct answers — Reddit threads, Quora answers, Wikipedia summaries, FAQ snippets — that AI engines often quote verbatim.",
    whyItMatters:
      "Users want answers, not link lists. Answer Engines (and AI summaries built on them) decide what gets surfaced based on signals like discussion engagement, structured FAQs, and authoritative sources. AEO captures attention before users ever reach a search results page.",
    howVentureCiteCovers: [
      "Reddit + Quora outreach campaign tooling",
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
  // Inline title + meta tag setter — matches the existing per-page
  // pattern in this codebase (no React Helmet dependency).
  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;
    const ensureMeta = (name: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      const prev = el.getAttribute("content");
      el.setAttribute("content", content);
      return () => {
        if (prev === null) {
          el?.remove();
        } else {
          el?.setAttribute("content", prev);
        }
      };
    };
    const restoreDescription = ensureMeta("description", META_DESCRIPTION);
    return () => {
      document.title = prevTitle;
      restoreDescription();
    };
  }, []);

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
      {/* JSON-LD schema for AI engines + Google rich-results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight">GEO vs AEO vs SEO</h1>
        <p className="mt-3 text-lg text-muted-foreground">
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
            <h2 className="text-2xl font-semibold">{term.code}</h2>
            <span className="text-lg text-muted-foreground">{term.name}</span>
          </div>

          <p className="text-foreground mb-3">{term.definition}</p>

          <h3 className="text-sm font-semibold mt-6 mb-2">Why it matters</h3>
          <p className="text-sm text-muted-foreground">{term.whyItMatters}</p>

          <h3 className="text-sm font-semibold mt-6 mb-2">How VentureCite covers it</h3>
          <ul className="space-y-1.5 text-sm text-muted-foreground list-disc list-inside">
            {term.howVentureCiteCovers.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h3 className="text-sm font-semibold mt-6 mb-2">Related pages</h3>
          <ul className="space-y-1">
            {term.relatedPages.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  className="inline-flex items-center text-sm text-primary hover:underline"
                >
                  {p.label} <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-3">How they layer</h2>
          <p className="text-sm text-muted-foreground">
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
