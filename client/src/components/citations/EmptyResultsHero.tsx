import { Search } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

interface EmptyResultsHeroProps {
  /** Optional CTA button rendered below the explainer. */
  action?: { label: string; onClick: () => void };
}

export default function EmptyResultsHero({ action }: EmptyResultsHeroProps) {
  return (
    <EmptyState
      icon={Search}
      title="No citations yet"
      description={
        <>
          AI engines (ChatGPT, Claude, Perplexity, …) re-index new content on their own schedule.
          First citations typically appear <strong>1–2 weeks</strong> after you publish a piece. In
          the meantime, run more checks to get a baseline, or finish your AI Visibility checklist.
        </>
      }
      action={action ? { label: action.label, onClick: action.onClick } : undefined}
    />
  );
}
