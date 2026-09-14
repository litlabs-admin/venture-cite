import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board16Data } from "./Screen";
export function useBoard16Data(): V2LiveResult<Board16Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
