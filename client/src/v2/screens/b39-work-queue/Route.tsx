import { StateView } from "../_placeholder/StateView";
import { Board39Screen } from "./Screen";
import { useBoard39Data } from "./data";
export function Board39Route() {
  const result = useBoard39Data();
  if (result.data !== undefined)
    return (
      <Board39Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
