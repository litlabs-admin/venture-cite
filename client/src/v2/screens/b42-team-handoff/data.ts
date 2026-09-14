// Live adapter for /v2/settings/team.
//
// This app has no multi-user membership table: a brand's only real member is
// its owner (brands.user_id). The team overview endpoint (server/routes/v2Team.ts)
// reflects that honestly - one real member, not five fixture rows. Active
// task counts come from the same work-tasks read `/v2/my-work` already uses
// (client/src/v2/data/workTasks.ts), scoped to the selected brand.

import { useBrandSelection } from "@/hooks/use-brand-selection";
import { toast } from "@/hooks/use-toast";
import type { V2LiveResult } from "@/v2/contracts/screen";
import { useWorkTasks } from "@/v2/data/workTasks";
import {
  useCreateInvitation,
  useResendInvitation,
  useRevokeInvitation,
  useTaskHandoff,
  useTeamOverview,
} from "@/v2/data/v2Team";
import { queueStatusForTask } from "../b03-task-list/shared/workMapping";
import type { Board42Data } from "./Screen";

function queryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load the team.";
}

export function useBoard42Data(): V2LiveResult<Board42Data> {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const overviewQuery = useTeamOverview(selectedBrandId);
  const tasksQuery = useWorkTasks(selectedBrandId);

  const createInvitation = useCreateInvitation(selectedBrandId);
  const revokeInvitation = useRevokeInvitation(selectedBrandId);
  const resendInvitation = useResendInvitation(selectedBrandId);
  const taskHandoff = useTaskHandoff(selectedBrandId);

  if (!selectedBrandId && !brandsLoading) {
    return { state: { kind: "empty", reason: "No brand is selected." } };
  }
  if (brandsLoading || overviewQuery.isPending || tasksQuery.isPending) {
    return { state: { kind: "loading" } };
  }
  if (overviewQuery.isError || tasksQuery.isError) {
    const error = overviewQuery.error ?? tasksQuery.error;
    return { state: { kind: "error", message: queryErrorMessage(error) } };
  }
  if (!overviewQuery.data) {
    return { state: { kind: "not-measured", reason: "Team data is not available." } };
  }

  const tasks = tasksQuery.data?.items ?? [];
  const activeStates = new Set(["ready", "in-progress"]);
  const activeTaskCount = tasks.filter((task) =>
    activeStates.has(queueStatusForTask(task.state)),
  ).length;
  const waitingConfirmationCount = tasks.filter(
    (task) => queueStatusForTask(task.state) === "waiting",
  ).length;
  const lastActivityAt = tasks.reduce<string | null>((latest, task) => {
    if (!latest || task.updatedAt > latest) return task.updatedAt;
    return latest;
  }, null);

  const data: Board42Data = {
    brandId: selectedBrandId,
    mode: "guided",
    brandName: selectedBrand?.name ?? "Selected brand",
    member: {
      id: overviewQuery.data.owner.id,
      name: overviewQuery.data.owner.name,
      email: overviewQuery.data.owner.email,
      assignedBrandCount: overviewQuery.data.assignedBrandCount,
      activeTaskCount,
      waitingConfirmationCount,
      lastActivityAt,
    },
    seatUsage: { used: overviewQuery.data.seatsUsed, limit: null },
    invitations: overviewQuery.data.invitations,
    auditEvents: overviewQuery.data.auditEvents,
    tasks: tasks.map((task) => ({ id: task.id, title: task.title })),
    actions: {
      onInvite: (input) =>
        createInvitation.mutate(input, {
          onError: (error) => toast({ description: error.message, variant: "destructive" }),
        }),
      isInvitePending: createInvitation.isPending,
      inviteError: createInvitation.error?.message ?? null,
      onRevoke: (invitationId) =>
        revokeInvitation.mutate(
          { invitationId },
          { onError: (error) => toast({ description: error.message, variant: "destructive" }) },
        ),
      isRevokePending: revokeInvitation.isPending,
      onResend: (invitationId) =>
        resendInvitation.mutate(
          { invitationId },
          {
            onSuccess: () => toast({ title: "Invitation resent" }),
            onError: (error) => toast({ description: error.message, variant: "destructive" }),
          },
        ),
      isResendPending: resendInvitation.isPending,
      onSubmitHandoff: (input) =>
        taskHandoff.mutate(input, {
          onSuccess: () => toast({ title: "Handoff recorded" }),
          onError: (error) => toast({ description: error.message, variant: "destructive" }),
        }),
      isHandoffPending: taskHandoff.isPending,
      handoffError: taskHandoff.error?.message ?? null,
    },
  };

  if (overviewQuery.isFetching || tasksQuery.isFetching) {
    const timestamps = [overviewQuery.dataUpdatedAt, tasksQuery.dataUpdatedAt].filter(
      (time) => time > 0,
    );
    return {
      state: {
        kind: "stale",
        reason: "Team data is refreshing.",
        asOf: new Date(Math.min(...timestamps)).toISOString(),
      },
      data,
    };
  }
  return { state: { kind: "ready" }, data };
}
