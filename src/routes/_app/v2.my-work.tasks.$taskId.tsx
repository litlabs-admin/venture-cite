import { createFileRoute } from "@tanstack/react-router";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useWorkTask } from "@/v2/data/workTasks";
import {
  taskDetailDispatch,
  type TaskDetailDispatchSummary,
} from "@/v2/dispatch/taskDetailDispatch";

function TaskDetailRoute() {
  const { taskId } = Route.useParams();
  const { selectedBrandId } = useBrandSelection();
  const taskQuery = useWorkTask(selectedBrandId, taskId);
  const task = taskQuery.data;
  const dispatchSummary: TaskDetailDispatchSummary = task
    ? {
        taskType: task.type,
        taskKey: task.taskKey,
        state: task.state,
      }
    : {
        taskType: "improve_page_for_buyer_need",
        taskKey: "pending",
        state: "suggested",
      };
  const ScreenRoute = taskDetailDispatch(dispatchSummary);
  return <ScreenRoute />;
}

export const Route = createFileRoute("/_app/v2/my-work/tasks/$taskId")({
  component: TaskDetailRoute,
  staticData: { v2Shell: "guided" },
});
