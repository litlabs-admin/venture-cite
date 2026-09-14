import { useAuth } from "@/hooks/use-auth";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useVerifyTask, useWorkTask } from "@/v2/data/workTasks";
import { StateView } from "../_placeholder/StateView";
import { Board05Screen, type Board05Confirm } from "./Screen";
import { useBoard05Data, useBoard05TaskId, verificationEvidenceFor } from "./data";

export function Board05Route() {
  const result = useBoard05Data();
  const { selectedBrandId } = useBrandSelection();
  const { user } = useAuth();
  const taskId = useBoard05TaskId();
  const detailQuery = useWorkTask(selectedBrandId, taskId);
  const verify = useVerifyTask(selectedBrandId);

  if (result.data !== undefined) {
    const task = result.data.task;
    const confirm: Board05Confirm = {
      pending: verify.isPending,
      error: verify.isError ? verify.error.message : undefined,
      run: () => {
        if (!user?.id || !detailQuery.data) return;
        const note = `Confirmed by the brand owner: ${
          result.data.confirmation.value.kind === "measured"
            ? result.data.confirmation.value.value
            : task.title
        } is correct.`;
        verify.mutate({
          taskId: task.id,
          expectedRevision: task.revision,
          cycleKey: `confirmation-v${task.revision}`,
          note,
          confirmedByUserId: user.id,
          evidence: [
            ...verificationEvidenceFor(detailQuery.data),
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
    };
    return (
      <Board05Screen
        confirm={confirm}
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
