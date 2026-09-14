import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board31Data } from "./Screen";
export function useBoard31Data(): V2LiveResult<Board31Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
