import { CheckCircle, Loader2, Circle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SourceProgress {
  status: "pending" | "in_progress" | "done" | "failed";
  facts: number;
}

export interface StaticPagesProgress extends SourceProgress {
  total?: number;
  done?: number;
  failed?: number;
}

export interface ScrapeProgressSources {
  userEnrich: SourceProgress;
  staticPages: StaticPagesProgress;
  searchLlm: SourceProgress;
}

interface Props {
  sources: ScrapeProgressSources;
}

function statusIcon(status: SourceProgress["status"]) {
  if (status === "done") return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (status === "in_progress") return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
  if (status === "failed") return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

export function ScrapeProgressCardV2({ sources }: Props) {
  const totalFacts = sources.userEnrich.facts + sources.staticPages.facts + sources.searchLlm.facts;

  return (
    <Card data-testid="scrape-progress-card-v2">
      <CardHeader>
        <CardTitle className="text-base">Building your fact sheet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {statusIcon(sources.userEnrich.status)}
            <span>Reading your description</span>
          </div>
          <span className="text-muted-foreground">
            {sources.userEnrich.status === "done"
              ? `done · ${sources.userEnrich.facts} facts`
              : sources.userEnrich.status}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {statusIcon(sources.staticPages.status)}
            <span>Reading your website</span>
          </div>
          <span className="text-muted-foreground">
            {sources.staticPages.status === "in_progress" && sources.staticPages.total
              ? `${sources.staticPages.done ?? 0}/${sources.staticPages.total} pages · ${sources.staticPages.facts} facts`
              : sources.staticPages.status === "done"
                ? `done · ${sources.staticPages.facts} facts`
                : sources.staticPages.status}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            {statusIcon(sources.searchLlm.status)}
            <span>Searching the web</span>
          </div>
          <span className="text-muted-foreground">
            {sources.searchLlm.status === "done"
              ? `done · ${sources.searchLlm.facts} facts`
              : sources.searchLlm.status}
          </span>
        </div>
        <div className="border-t pt-3 text-sm font-medium">{totalFacts} facts so far</div>
      </CardContent>
    </Card>
  );
}
