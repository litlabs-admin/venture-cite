// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BoardId, V2ScreenState } from "@/v2/contracts/screen";
import type { V2ShellVariant } from "@/v2/contracts/shell";
import { SCREENS } from "@/v2/screens/registry";
import { StateView } from "@/v2/screens/_placeholder/StateView";

const BOARD_IDS: BoardId[] = Array.from(
  { length: 47 },
  (_, index) => `b${String(index + 1).padStart(2, "0")}` as BoardId,
);

const SHELL_VARIANTS = ["guided", "expert", "expert-nav", "agency", "bare"] as const;

const EXPECTED_SHELLS: Record<BoardId, V2ShellVariant> = {
  b01: "guided",
  b02: "guided",
  b03: "guided",
  b04: "guided",
  b05: "guided",
  b06: "guided",
  b07: "guided",
  b08: "expert",
  b09: "expert",
  b10: "guided",
  b11: "guided",
  b12: "expert-nav",
  b13: "expert",
  b14: "guided",
  b15: "guided",
  b16: "guided",
  b17: "guided",
  b18: "expert",
  b19: "guided",
  b20: "guided",
  b21: "guided",
  b22: "guided",
  b23: "agency",
  b24: "guided",
  b25: "guided",
  b26: "bare",
  b27: "bare",
  b28: "bare",
  b29: "bare",
  b30: "bare",
  b31: "bare",
  b32: "bare",
  b33: "guided",
  b34: "guided",
  b35: "expert",
  b36: "expert",
  b37: "expert",
  b38: "expert",
  b39: "guided",
  b40: "expert",
  b41: "expert",
  b42: "guided",
  b43: "guided",
  b44: "guided",
  b45: "guided",
  b46: "guided",
  b47: "guided",
};

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
      expect(entry.shell).toBe(EXPECTED_SHELLS[boardId]);
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
