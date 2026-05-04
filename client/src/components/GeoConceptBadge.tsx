import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

/** Inline GEO/AEO/SEO concept pill. Click → navigates to /glossary anchor.
 *  Hover → shows the definition without leaving the page. Used inline in
 *  page descriptions, empty states, and (later) chatbot responses. */
const DEFINITIONS: Record<"GEO" | "AEO" | "SEO", { name: string; short: string }> = {
  GEO: {
    name: "Generative Engine Optimization",
    short:
      "Optimizing your content + brand to be cited by AI assistants (ChatGPT, Claude, Perplexity, etc.).",
  },
  AEO: {
    name: "Answer Engine Optimization",
    short:
      "Optimizing for systems that give direct answers — Reddit/Quora threads, Wikipedia, AI summaries.",
  },
  SEO: {
    name: "Search Engine Optimization",
    short: "Traditional Google/Bing ranking — the foundation that GEO and AEO build on.",
  },
};

interface GeoConceptBadgeProps {
  concept: "GEO" | "AEO" | "SEO";
  className?: string;
}

export default function GeoConceptBadge({ concept, className }: GeoConceptBadgeProps) {
  const def = DEFINITIONS[concept];
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <a
          href={`/glossary#${concept.toLowerCase()}`}
          className={["inline-block", className].filter(Boolean).join(" ")}
          aria-label={`${def.name} — open glossary`}
        >
          <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-accent">
            {concept}
          </Badge>
        </a>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 text-sm" align="start">
        <p className="font-medium text-foreground">{def.name}</p>
        <p className="mt-1 text-muted-foreground">{def.short}</p>
        <a
          href={`/glossary#${concept.toLowerCase()}`}
          className="mt-2 inline-block text-xs text-primary hover:underline"
        >
          Learn more →
        </a>
      </HoverCardContent>
    </HoverCard>
  );
}
