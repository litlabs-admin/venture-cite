import { useParams } from "@tanstack/react-router";
import { StateView } from "../_placeholder/StateView";
import { Board19Screen } from "./Screen";
import { useBoard19Data } from "./data";
export function Board19Route() {
  const params = useParams({ strict: false });
  const result = useBoard19Data(params.taskId);
  if (result.data !== undefined)
    return (
      <Board19Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
