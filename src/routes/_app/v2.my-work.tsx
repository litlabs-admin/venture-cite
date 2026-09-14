import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { MyWorkNav } from "@/v2/mywork/MyWorkNav";

// `/v2/my-work` and its siblings: the task list, the planning queue, earned
// media and content opportunities. The dotted filename resolves to the
// nested path, so the route id is "/_app/v2/my-work" - the parent (`v2.tsx`)
// already carries the gate and the search schema, and neither is repeated.
//
// This file mounts the section's own sub-tab strip once, above every child
// route, so Tasks/Queue/Earned media/Content opportunities read as one
// section instead of four routes with no link back to each other. The one
// route this strip does not belong on is task detail
// (`/v2/my-work/tasks/$taskId`): that screen is a single task's approved
// canvas board, not a list, and the strip would be a second, contradictory
// navigation row sitting above it.
function MyWorkLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isTaskDetail = pathname.startsWith("/v2/my-work/tasks/");

  if (isTaskDetail) return <Outlet />;

  return (
    <div className="flex min-h-full flex-col">
      <MyWorkNav />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app/v2/my-work")({
  component: MyWorkLayout,
  staticData: { v2Shell: "guided" },
});
