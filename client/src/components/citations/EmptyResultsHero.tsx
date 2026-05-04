import { Card, CardContent } from "@/components/ui/card";
import { Search } from "lucide-react";

interface EmptyResultsHeroProps {
  /** Optional CTA button rendered below the explainer. */
  action?: { label: string; onClick: () => void };
}

export default function EmptyResultsHero({ action }: EmptyResultsHeroProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center text-center p-8">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Search className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold">No citations yet</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          AI engines (ChatGPT, Claude, Perplexity, …) re-index new content on their own schedule.
          First citations typically appear <strong>1–2 weeks</strong> after you publish a piece. In
          the meantime, run more checks to get a baseline, or finish your AI Visibility checklist.
        </p>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-4 inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            {action.label}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
