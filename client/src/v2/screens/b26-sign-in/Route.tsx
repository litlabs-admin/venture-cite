import { StateView } from "../_placeholder/StateView";
import { Board26Screen } from "./Screen";
import { useBoard26Data } from "./data";
export function Board26Route() {
  const result = useBoard26Data();
  if (result.data !== undefined)
    return (
      <Board26Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
