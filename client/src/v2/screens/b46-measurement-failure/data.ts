import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board46Data } from "./Screen";
export function useBoard46Data(): V2LiveResult<Board46Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
