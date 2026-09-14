import { StateView } from "../_placeholder/StateView";
import { Board02Screen } from "./Screen";
import { useBoard02Data } from "./data";

export function Board02Route() {
  const result = useBoard02Data();
  if (result.data !== undefined) {
    return (
      <Board02Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
