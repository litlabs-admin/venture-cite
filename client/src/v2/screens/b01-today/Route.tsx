import { StateView } from "../_placeholder/StateView";
import { Board01Screen } from "./Screen";
import { useBoard01Data } from "./data";

export function Board01Route() {
  const result = useBoard01Data();
  if (result.data !== undefined) {
    return (
      <Board01Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
