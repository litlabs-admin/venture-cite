import { StateView } from "../_placeholder/StateView";
import { Board20Screen } from "./Screen";
import { useBoard20Data } from "./data";
export function Board20Route() {
  const result = useBoard20Data();
  if (result.data !== undefined)
    return (
      <Board20Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
