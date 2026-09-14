import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useTaskCommand } from "@/v2/data/workTasks";
import { StateView } from "../_placeholder/StateView";
import { Board03Screen, type Board03NotApplicableAction, type Board03Task } from "./Screen";
import { useBoard03Data } from "./data";

export function Board03Route() {
  const result = useBoard03Data();
  const { selectedBrandId } = useBrandSelection();
  const mutation = useTaskCommand(selectedBrandId);

  const notApplicable: Board03NotApplicableAction = {
    pendingTaskId: mutation.isPending ? mutation.variables?.taskId : undefined,
    error: mutation.isError ? mutation.error.message : undefined,
    run: (task: Board03Task, reason: string) => {
      mutation.mutate({
        taskId: task.id,
        expectedRevision: task.revision,
        command: { kind: "mark_not_applicable", reason },
      });
    },
  };

  if (result.data !== undefined) {
    return (
      <Board03Screen
        data={result.data}
        notApplicable={notApplicable}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
