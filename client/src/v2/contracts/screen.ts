/**
 * The contract every screen module follows. Foundation-owned: builders import
 * from here and never edit it. A change here is its own reviewed change.
 *
 * A screen is split so that it can be built, reviewed for parity and wired to
 * data independently:
 *
 *   client/src/v2/screens/bNN-<slug>/
 *     Screen.tsx   the presentational screen. Pure: renders only from props.
 *     fixture.ts   the exact data shown on the approved render, verbatim.
 *     data.ts      the live adapter. Returns real data or an honest state.
 *     Route.tsx    the container a route mounts: live data -> Screen.
 *
 * The preview route renders Screen with the fixture, which is how parity with
 * the render is checked. The live route renders Route. A number the backend
 * cannot yet produce is never faked in live mode: the adapter returns a state.
 */

/** Authoritative board numbers, matching the canvas captions. */
export type BoardId =
  | "b01"
  | "b02"
  | "b03"
  | "b04"
  | "b05"
  | "b06"
  | "b07"
  | "b08"
  | "b09"
  | "b10"
  | "b11"
  | "b12"
  | "b13"
  | "b14"
  | "b15"
  | "b16"
  | "b17"
  | "b18"
  | "b19"
  | "b20"
  | "b21"
  | "b22"
  | "b23"
  | "b24"
  | "b25"
  | "b26"
  | "b27"
  | "b28"
  | "b29"
  | "b30"
  | "b31"
  | "b32"
  | "b33"
  | "b34"
  | "b35"
  | "b36"
  | "b37"
  | "b38"
  | "b39"
  | "b40"
  | "b41"
  | "b42"
  | "b43"
  | "b44"
  | "b45"
  | "b46"
  | "b47";

/**
 * Whole-screen state. Kept distinct on purpose: a screen that was never
 * measured, a screen whose measurement failed, a screen with stale data and a
 * screen with no finding are four different facts and must never collapse into
 * one generic "empty" rendering.
 */
export type V2ScreenState =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "empty"; reason: string }
  | { kind: "not-measured"; reason: string }
  | { kind: "failed"; reason: string; retryable: boolean }
  | { kind: "stale"; reason: string; asOf: string }
  | { kind: "error"; message: string };

/** What a live adapter returns. `data` is present only when state is ready or stale. */
export type V2LiveResult<TData> =
  | { state: { kind: "ready" } | Extract<V2ScreenState, { kind: "stale" }>; data: TData }
  | { state: Exclude<V2ScreenState, { kind: "ready" } | { kind: "stale" }>; data?: undefined };

/** Props every presentational Screen receives. */
export type V2ScreenProps<TData> = {
  data: TData;
  /** Omitted in preview. Present when the live adapter reports stale data. */
  staleAsOf?: string;
};
