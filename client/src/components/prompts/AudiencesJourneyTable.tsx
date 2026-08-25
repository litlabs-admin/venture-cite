import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PromptAudience } from "@/hooks/usePrompts";
import { FUNNEL_LABEL } from "./AudiencesOverviewTable";

const STAGE_ORDER = ["TOFU", "MOFU", "BOFU"] as const;

type StageGroup = {
  stage: string;
  audiences: PromptAudience[];
  promptCount: number;
  avgScore: number | null;
};

function groupByStage(audiences: PromptAudience[]): StageGroup[] {
  const groups = new Map<string, PromptAudience[]>();
  for (const a of audiences) {
    const key = a.funnelStage ?? "unstaged";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(a);
  }
  const order = [...STAGE_ORDER, "unstaged"];
  return order
    .filter((s) => groups.has(s))
    .map((stage) => {
      const members = groups.get(stage)!;
      const promptCount = members.reduce((s, a) => s + (a.promptCount ?? 0), 0);
      const scores = members.map((a) => a.score).filter((s): s is number => typeof s === "number");
      const avgScore =
        scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;
      return { stage, audiences: members, promptCount, avgScore };
    });
}

// Different template sentence from the Overview tab's - same real-numbers
// discipline, framed around the journey instead of a single leader/trailer.
function journeyInsight(groups: StageGroup[]): string {
  const scored = groups.filter(
    (g): g is StageGroup & { avgScore: number } => typeof g.avgScore === "number",
  );
  if (scored.length < 2)
    return "Group prompts into audiences with a funnel stage to see journey coverage.";
  const sorted = [...scored].sort((a, b) => a.avgScore - b.avgScore);
  const weakest = sorted[0];
  return `Visibility is lowest at the ${FUNNEL_LABEL[weakest.stage] ?? weakest.stage} stage (${weakest.avgScore}/100) - that's where prompts go unanswered most often.`;
}

export function AudiencesJourneyTable({ audiences }: { audiences: PromptAudience[] }) {
  const groups = groupByStage(audiences);

  return (
    <div>
      <p className="mb-4 text-caption text-vc-tertiary">{journeyInsight(groups)}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Stage</TableHead>
            <TableHead>Audiences</TableHead>
            <TableHead className="text-right">Prompts</TableHead>
            <TableHead className="text-right">Visibility</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g) => (
            <TableRow key={g.stage}>
              <TableCell className="text-caption font-medium text-vc-primary">
                {FUNNEL_LABEL[g.stage] ?? "Unstaged"}
              </TableCell>
              <TableCell className="text-data text-vc-tertiary">
                {g.audiences.map((a) => a.name).join(", ")}
              </TableCell>
              <TableCell className="text-right font-mono text-data tabular-nums text-vc-tertiary">
                {g.promptCount}
              </TableCell>
              <TableCell className="text-right font-mono text-data tabular-nums text-vc-secondary">
                {g.avgScore ?? "–"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
