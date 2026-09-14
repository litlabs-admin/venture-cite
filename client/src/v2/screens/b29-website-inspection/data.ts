import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board29Data } from "./Screen";
export function useBoard29Data(): V2LiveResult<Board29Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
