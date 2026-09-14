// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BoardId, V2ScreenState } from "@/v2/contracts/screen";
import { SCREENS } from "@/v2/screens/registry";
import { StateView } from "@/v2/screens/_placeholder/StateView";

const BOARD_IDS: BoardId[] = Array.from(
  { length: 47 },
  (_, index) => `b${String(index + 1).padStart(2, "0")}` as BoardId,
);

const SHELL_VARIANTS = ["guided", "expert", "expert-nav", "agency", "bare"] as const;

afterEach(() => {
  cleanup();
});

describe("v2 screen registry", () => {
  it("registers exactly the 47 boards with all required entries", () => {
    expect(Object.keys(SCREENS).sort()).toEqual(BOARD_IDS.slice().sort());

    for (const boardId of BOARD_IDS) {
      const entry = SCREENS[boardId];
      expect(entry.title).toBeTruthy();
      expect(entry.Screen).toEqual(expect.any(Function));
      expect(entry.fixture).toEqual(expect.any(Object));
      expect(entry.Route).toEqual(expect.any(Function));
      expect(SHELL_VARIANTS).toContain(entry.shell);
    }
  });

  it("lets every placeholder screen identify its board", () => {
    for (const boardId of BOARD_IDS) {
      const EntryScreen = SCREENS[boardId].Screen;
      render(<EntryScreen data={SCREENS[boardId].fixture} />);
      expect(screen.getByTestId(`v2-placeholder-${boardId}`)).toBeInTheDocument();
      expect(screen.getByText(boardId)).toBeInTheDocument();
      cleanup();
    }
  });
});

describe("v2 placeholder state view", () => {
  const states: Exclude<V2ScreenState, { kind: "ready" }>[] = [
    { kind: "not-measured", reason: "No measurement exists." },
    { kind: "failed", reason: "The provider failed.", retryable: true },
    { kind: "stale", reason: "The last result is old.", asOf: "2026-09-14" },
    { kind: "empty", reason: "No findings exist." },
    { kind: "loading" },
    { kind: "error", message: "The screen failed." },
  ];

  it.each(states)("renders a distinct label for the $kind state", (state) => {
    render(<StateView state={state} />);

    const view = screen.getByTestId(`v2-state-${state.kind}`);
    expect(view).toBeInTheDocument();
    expect(
      within(view).getByText(new RegExp(`^${state.kind.replace("-", " ")}$`, "i")),
    ).toBeInTheDocument();
  });
});
