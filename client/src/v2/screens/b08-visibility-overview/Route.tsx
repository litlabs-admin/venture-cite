import { StateView } from "../_placeholder/StateView";
import { Board08Screen } from "./Screen";
import { useBoard08Data } from "./data";

export function Board08Route() {
  const result = useBoard08Data();
  if (result.data !== undefined) {
    return (
      <Board08Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
