import { StateView } from "../_placeholder/StateView";
import { Board41Screen } from "./Screen";
import { useBoard41Actions, useBoard41Data } from "./data";
export function Board41Route() {
  const result = useBoard41Data();
  const actions = useBoard41Actions();
  if (result.data !== undefined)
    return (
      <Board41Screen
        actions={actions}
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
