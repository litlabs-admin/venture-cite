import { createFileRoute } from "@tanstack/react-router";
import MyWorkPage from "@/v2/mywork/MyWorkPage";

function MyWorkRoute() {
  const { task } = Route.useSearch();
  return <MyWorkPage taskId={task} />;
}

export const Route = createFileRoute("/_app/v2/my-work/")({
  component: MyWorkRoute,
  staticData: { v2Shell: "guided", v2Board: "b03" },
});
