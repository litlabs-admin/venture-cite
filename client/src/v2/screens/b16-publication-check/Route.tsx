import { useAuth } from "@/hooks/use-auth";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useVerifyTask } from "@/v2/data/workTasks";
import { StateView } from "../_placeholder/StateView";
import { Board16Screen, type Board16Actions } from "./Screen";
import { useBoard16Data, usePublicationCheck } from "./data";

export function Board16Route() {
  const result = useBoard16Data();
  const { selectedBrandId } = useBrandSelection();
  const { user } = useAuth();
  const taskId = result.data?.task.id;
  const fetchLatest = usePublicationCheck(selectedBrandId, taskId);
  const verify = useVerifyTask(selectedBrandId);

  if (result.data !== undefined) {
    const task = result.data.task;
    const blocked = task.verificationEvidence.length === 0 || !user?.id;
    const actions: Board16Actions = {
      fetchLatest: {
        run: (url: string) => fetchLatest.mutate(url),
        pending: fetchLatest.isPending,
        result: fetchLatest.data,
        error: fetchLatest.isError ? fetchLatest.error.message : undefined,
      },
      verify: {
        pending: verify.isPending,
        blocked,
        error: blocked
          ? "No published-page evidence is recorded for this task yet, so it cannot be verified here."
          : verify.isError
            ? verify.error.message
            : undefined,
        run: () => {
          if (!user?.id) return;
          const note =
            task.buyerNeed.kind === "measured"
              ? `Publication confirmed for: ${task.buyerNeed.value}`
              : "Publication confirmed.";
          verify.mutate({
            taskId: task.id,
            expectedRevision: task.revision,
            cycleKey: `confirmation-v${task.revision}`,
            note,
            confirmedByUserId: user.id,
            evidence: [
              ...task.verificationEvidence,
              {
                kind: "confirmation",
                label: "Owner confirmation",
                confirmedByUserId: user.id,
                note,
                confirmedAt: new Date().toISOString(),
              },
            ],
          });
        },
      },
    };
    return (
      <Board16Screen
        actions={actions}
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }
  return <StateView state={result.state} />;
}
