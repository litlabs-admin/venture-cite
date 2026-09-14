import { StateView } from "../_placeholder/StateView";
import { Board21Screen } from "./Screen";
import { useBoard21Data } from "./data";
export function Board21Route() {
  const result = useBoard21Data();
  if (result.data !== undefined)
    return (
      <Board21Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
