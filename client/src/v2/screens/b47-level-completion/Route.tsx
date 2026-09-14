import { StateView } from "../_placeholder/StateView";
import { Board47Screen } from "./Screen";
import { useBoard47Data } from "./data";
export function Board47Route() {
  const result = useBoard47Data();
  if (result.data !== undefined)
    return (
      <Board47Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  return <StateView state={result.state} />;
}
