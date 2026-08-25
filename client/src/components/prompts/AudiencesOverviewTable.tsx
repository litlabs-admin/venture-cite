import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PromptAudience } from "@/hooks/usePrompts";

const FUNNEL_LABEL: Record<string, string> = {
  TOFU: "Awareness",
  MOFU: "Consideration",
  BOFU: "Decision",
};

// A template sentence filled from real numbers - not an LLM call. Mirrors
// the plan's "insight sentence" requirement without spending a request on
// something that's really just string formatting.
function overviewInsight(audiences: PromptAudience[]): string {
  if (audiences.length === 0) return "No audiences yet.";
  const scored = audiences.filter(
    (a): a is PromptAudience & { score: number } => typeof a.score === "number",
  );
  if (scored.length === 0) {
    return `${audiences.length} audience${audiences.length === 1 ? "" : "s"} tracked - none of their prompts have a scored run yet.`;
  }
  const strongest = scored.reduce((a, b) => (b.score > a.score ? b : a));
  const weakest = scored.reduce((a, b) => (b.score < a.score ? b : a));
  if (strongest.id === weakest.id) {
    return `${strongest.name} is the only scored audience, averaging ${strongest.score}/100.`;
  }
  return `${strongest.name} leads at ${strongest.score}/100; ${weakest.name} trails at ${weakest.score}/100.`;
}

export function AudiencesOverviewTable({ audiences }: { audiences: PromptAudience[] }) {
  return (
    <div>
      <p className="mb-4 text-caption text-vc-tertiary">{overviewInsight(audiences)}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Audience</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="text-right">Prompts</TableHead>
            <TableHead className="text-right">Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {audiences.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <div className="text-caption font-medium text-vc-primary">{a.name}</div>
                {a.description && (
                  <div className="mt-0.5 text-data text-vc-tertiary">{a.description}</div>
                )}
              </TableCell>
              <TableCell className="text-data text-vc-tertiary">
                {a.funnelStage ? (FUNNEL_LABEL[a.funnelStage] ?? a.funnelStage) : "–"}
              </TableCell>
              <TableCell className="text-right font-mono text-data tabular-nums text-vc-tertiary">
                {a.promptCount ?? 0}
              </TableCell>
              <TableCell className="text-right font-mono text-data tabular-nums text-vc-secondary">
                {typeof a.score === "number" ? a.score : "–"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export { FUNNEL_LABEL };
