import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board30Data } from "./Screen";
export function useBoard30Data(): V2LiveResult<Board30Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
