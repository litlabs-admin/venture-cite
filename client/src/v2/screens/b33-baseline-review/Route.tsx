import { useNavigate } from "@tanstack/react-router";
import { StateView } from "../_placeholder/StateView";
import { Board33Screen } from "./Screen";
import { useBoard33Data } from "./data";
import { useSetBrandGoal } from "./goalMutation";

export function Board33Route() {
  const result = useBoard33Data();
  const navigate = useNavigate();
  const brandId = result.data?.brandId ?? "";
  const mode = result.data?.mode ?? "guided";
  const setGoal = useSetBrandGoal(brandId);

  if (result.data !== undefined) {
    return (
      <Board33Screen
        data={result.data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
        isSavingGoal={setGoal.isPending}
        saveGoalError={setGoal.isError ? "The goal could not be saved. Try again." : null}
        onChooseGoal={(goalKey) => {
          setGoal.mutate(goalKey, {
            onSuccess: () => {
              // The saved goal moves the Today dispatch off board 33; land
              // on My work, where the newly-ranked queue is visible.
              void navigate({ to: "/v2/my-work", search: { brandId, mode } });
            },
          });
        }}
      />
    );
  }

  return <StateView state={result.state} />;
}
