/**
 * Shell contract. Foundation-owned: builders import from here and never edit it.
 *
 * The approved renders use five chrome variants. A route declares which one it
 * needs through `staticData.v2Shell`, and the shell reads the deepest matched
 * route's value. Routes never import or wrap the shell themselves, so the route
 * files and the shell can be built in parallel.
 */
import type { BoardId } from "./screen";

export type V2ShellVariant =
  /** Guided rail with the Guided/Expert toggle showing Guided. Most boards; the per-route value is authoritative. */
  | "guided"
  /** Same rail with the toggle showing Expert. Boards 08, 09, 11, 13, 18. */
  | "expert"
  /** The separate Expert navigation with the global top search bar. Board 12. */
  | "expert-nav"
  /** Portfolio chrome for agencies, with its own navigation. Board 23. */
  | "agency"
  /** No rail at all: sign-in, plan selection and the onboarding steps. Boards 26-32. */
  | "bare";

export type V2Mode = "guided" | "expert";

/** One navigation entry. `to` is a real route path; `board` links it to the canvas. */
export type V2NavItem = {
  id: string;
  label: string;
  to: string;
  icon: import("./icons").V2IconName;
  board?: BoardId;
  /** Small trailing indicator dot, as the Expert navigation shows. */
  dot?: boolean;
};

export type V2NavSection = { id: string; items: V2NavItem[] };

export type V2NavMap = Record<Exclude<V2ShellVariant, "bare">, V2NavSection[]>;

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** Which chrome this route renders inside. Defaults to "guided" when absent. */
    v2Shell?: V2ShellVariant;
    /** The canvas board this route implements, for parity tooling. */
    v2Board?: BoardId;
  }
}
