import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

/** Per-page explainer rendered inside the (i) icon's popover. Stored
 *  centrally in client/src/lib/pageExplainers.ts so copy edits happen
 *  in one place (and so the chatbot in Phase 5 can read the same
 *  copy users see in the popover). */
export type PageExplainer = {
  /** Required. One sentence: "what this page does." */
  summary: string;
  /** Optional: "Run this AFTER X." */
  prerequisites?: string;
  /** Optional: "Citations appear within 1–2 weeks…" */
  expectedOutcome?: string;
  /** Optional: shows a related-concept badge in the popover footer. */
  relatedConcept?: "GEO" | "AEO" | "SEO";
};

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  leading?: ReactNode;
  /** Optional. When present, renders an (i) icon next to the title that
   *  opens a popover with the explainer copy. Backward-compatible —
   *  existing callers without this prop keep working unchanged. */
  explainer?: PageExplainer;
}

export default function PageHeader({
  title,
  description,
  actions,
  leading,
  explainer,
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0 flex items-start gap-2">
        {leading && <div className="shrink-0 mt-0.5">{leading}</div>}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight truncate">
              {title}
            </h1>
            {explainer && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Page explainer"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Info className="h-4 w-4" aria-hidden="true" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 text-sm" align="start">
                  <p className="text-foreground">{explainer.summary}</p>
                  {explainer.prerequisites && (
                    <p className="mt-2 text-muted-foreground">
                      <span className="font-medium text-foreground">Before this:</span>{" "}
                      {explainer.prerequisites}
                    </p>
                  )}
                  {explainer.expectedOutcome && (
                    <p className="mt-2 text-muted-foreground">
                      <span className="font-medium text-foreground">What to expect:</span>{" "}
                      {explainer.expectedOutcome}
                    </p>
                  )}
                  {explainer.relatedConcept && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Related:</span>
                      <Badge variant="secondary" className="text-xs">
                        <a
                          href={`/glossary#${explainer.relatedConcept.toLowerCase()}`}
                          className="hover:underline"
                        >
                          {explainer.relatedConcept}
                        </a>
                      </Badge>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </div>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
