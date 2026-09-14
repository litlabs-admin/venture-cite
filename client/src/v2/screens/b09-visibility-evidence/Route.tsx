import { StateView } from "../_placeholder/StateView";
import { Board09Screen } from "./Screen";
import { useBoard09Data } from "./data";

export function Board09Route() {
  const result = useBoard09Data();
  if (result.data !== undefined) {
    return (
      <Board09Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
