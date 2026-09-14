import type { V2ScreenState } from "@/v2/contracts/screen";

type NonReadyState = Exclude<V2ScreenState, { kind: "ready" }>;
type StateCopy = { glyph: string; label: string; detail?: string };

function copyForState(state: NonReadyState): StateCopy {
  switch (state.kind) {
    case "loading":
      return { glyph: "…", label: "Loading" };
    case "not-measured":
      return { glyph: "○", label: "Not measured", detail: state.reason };
    case "failed":
      return { glyph: "!", label: "Failed", detail: state.reason };
    case "stale":
      return { glyph: "◷", label: "Stale", detail: `${state.reason} As of ${state.asOf}.` };
    case "empty":
      return { glyph: "—", label: "Empty", detail: state.reason };
    case "error":
      return { glyph: "×", label: "Error", detail: state.message };
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

export function StateView({ state }: { state: NonReadyState }) {
  const copy = copyForState(state);
  return (
    <section className="v2-mono v2-state-view" data-testid={`v2-state-${state.kind}`} role="status">
      <span aria-hidden="true">{copy.glyph}</span>
      <strong>{copy.label}</strong>
      {copy.detail ? <p>{copy.detail}</p> : null}
    </section>
  );
}
