import { useParams } from "@tanstack/react-router";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useContentTaskActions } from "../b06-buyer-guide-editor/shared/contentTaskAdapter";
import { StateView } from "../_placeholder/StateView";
import { Board19Screen } from "./Screen";
import { useBoard19Data } from "./data";
export function Board19Route() {
  const params = useParams({ strict: false }) as { taskId?: string };
  const { selectedBrandId } = useBrandSelection();
  const result = useBoard19Data(params.taskId);
  const actions = useContentTaskActions(selectedBrandId, result.data);
  if (result.data !== undefined)
    return (
      <Board19Screen
        actions={actions}
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
