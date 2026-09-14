import { StateView } from "../_placeholder/StateView";
import { Board40Screen } from "./Screen";
import { useBoard40Actions, useBoard40Data } from "./data";
export function Board40Route() {
  const result = useBoard40Data();
  const actions = useBoard40Actions();
  if (result.data !== undefined)
    return (
      <Board40Screen
        actions={actions}
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
