import { StateView } from "../_placeholder/StateView";
import { Board32Screen } from "./Screen";
import { useBoard32Data } from "./data";
export function Board32Route() {
  const result = useBoard32Data();
  if (result.data !== undefined)
    return (
      <Board32Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
