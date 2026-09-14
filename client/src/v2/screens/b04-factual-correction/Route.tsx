import { StateView } from "../_placeholder/StateView";
import { Board04Screen } from "./Screen";
import { useBoard04Data } from "./data";

export function Board04Route() {
  const result = useBoard04Data();
  if (result.data !== undefined) {
    return (
      <Board04Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
