// client/src/components/diagnose/IssueStats.tsx

import { Button } from "@/components/ui/button";
import type { IssueStats as Stats, IssueType } from "@shared/diagnoseTypes";

const LABEL: Record<IssueType, string> = {
  hallucination: "Hallucinations",
  listicle_gap: "Missed citations",
  wikipedia_gap: "Wikipedia gaps",
  crawler_block: "Crawlers blocked",
  weak_signal: "Weak signals",
  missing_schema: "Missing schema",
  stale_article: "Stale articles",
};

export default function IssueStats({
  stats,
  activeFilter,
  onToggle,
}: {
  stats: Stats;
  activeFilter: IssueType | null;
  onToggle: (type: IssueType) => void;
}) {
  const types = Object.keys(stats) as IssueType[];
  return (
    <div className="flex flex-wrap gap-2">
      {types.map((t) => {
        const n = stats[t];
        if (n === 0) return null;
        const active = activeFilter === t;
        return (
          <Button
            key={t}
            size="sm"
            variant={active ? "default" : "outline"}
            onClick={() => onToggle(t)}
          >
            <span className="tabular-nums">{n}</span>
            <span className="ml-1">{LABEL[t]}</span>
          </Button>
        );
      })}
    </div>
  );
}
