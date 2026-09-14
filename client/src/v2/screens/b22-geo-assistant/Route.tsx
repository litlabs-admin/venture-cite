import { StateView } from "../_placeholder/StateView";
import { Board22Screen } from "./Screen";
import { useBoard22Data } from "./data";
export function Board22Route() {
  const result = useBoard22Data();
  if (result.data !== undefined)
    return (
      <Board22Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
