import { useAuth } from "@/hooks/use-auth";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useTaskCommand, useVerifyTask } from "@/v2/data/workTasks";
import { StateView } from "../_placeholder/StateView";
import { Board04Screen, type Board04Data, type Board04Primary } from "./Screen";
import { useBoard04Data } from "./data";

/** The primary control, derived from the task's own state - never a control
 *  the server would reject. `suggested`/`accepted` progress the task
 *  ("accept"/"start"); `in_progress`/`reopened` have nothing this screen can
 *  submit on the task's behalf (repair evidence is written by the automated
 *  recheck, not typed here) so the control stays closed and says why;
 *  `submitted` is the one state `verifyTask` accepts a human confirmation
 *  from (`server/domains/work/policy.ts`), which is where "Confirm facts and
 *  complete task" actually sends the call. */
function primaryFor(
  task: Board04Data["task"],
  userId: string | undefined,
  command: ReturnType<typeof useTaskCommand>,
  verify: ReturnType<typeof useVerifyTask>,
): Board04Primary {
  switch (task.state) {
    case "suggested":
      return {
        kind: "accept",
        pending: command.isPending,
        run: () =>
          command.mutate({ taskId: task.id, expectedRevision: task.revision, command: { kind: "accept" } }),
      };
    case "accepted":
    case "reopened":
      return {
        kind: "start",
        pending: command.isPending,
        run: () =>
          command.mutate({ taskId: task.id, expectedRevision: task.revision, command: { kind: "start" } }),
      };
    case "in_progress":
      return {
        kind: "closed",
        reason: "Waiting for the automated recheck to confirm the published page.",
      };
    case "submitted": {
      const blocked = task.verificationEvidence.length === 0 || !userId;
      return {
        kind: "confirm",
        pending: verify.isPending,
        blocked,
        reason: blocked
          ? "No repair check evidence is recorded for this task yet, so it cannot be confirmed here."
          : verify.isError
            ? `That confirmation was not saved: ${verify.error.message}`
            : undefined,
        run: () => {
          if (!userId) return;
          const note = `Confirmed by the brand owner: ${task.approvedFact.kind === "measured" ? task.approvedFact.value : task.title}`;
          verify.mutate({
            taskId: task.id,
            expectedRevision: task.revision,
            cycleKey: `confirmation-v${task.revision}`,
            note,
            confirmedByUserId: userId,
            evidence: [
              ...task.verificationEvidence,
              { kind: "confirmation", label: "Owner confirmation", confirmedByUserId: userId, note, confirmedAt: new Date().toISOString() },
            ],
          });
        },
      };
    }
    case "verified":
      return { kind: "closed", reason: "This task is already verified." };
    case "waiting_for_observation":
      return { kind: "closed", reason: "Waiting for the next observation." };
    case "dismissed":
      return { kind: "closed", reason: "This task was dismissed." };
    case "not_applicable":
      return { kind: "closed", reason: "This task was marked not applicable." };
    default: {
      const _exhaustive: never = task.state;
      return _exhaustive;
    }
  }
}

export function Board04Route() {
  const result = useBoard04Data();
  const { selectedBrandId } = useBrandSelection();
  const { user } = useAuth();
  const command = useTaskCommand(selectedBrandId);
  const verify = useVerifyTask(selectedBrandId);

  if (result.data !== undefined) {
    return (
      <Board04Screen
        data={result.data}
        primary={primaryFor(result.data.task, user?.id, command, verify)}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
