import { StateView } from "../_placeholder/StateView";
import { Board10Screen } from "./Screen";
import { useBoard10Data } from "./data";

export function Board10Route() {
  const result = useBoard10Data();
  if (result.data !== undefined) {
    return (
      <Board10Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }

  return <StateView state={result.state} />;
}
