import { useParams } from "@tanstack/react-router";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useContentTaskActions } from "./shared/contentTaskAdapter";
import { StateView } from "../_placeholder/StateView";
import { Board06Screen } from "./Screen";
import { useBoard06Data } from "./data";

export function Board06Route() {
  const params = useParams({ strict: false }) as { taskId?: string };
  const { selectedBrandId } = useBrandSelection();
  const result = useBoard06Data(params.taskId);
  const actions = useContentTaskActions(selectedBrandId, result.data);
  if (result.data !== undefined) {
    return (
      <Board06Screen
        actions={actions}
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
