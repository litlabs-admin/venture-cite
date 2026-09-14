import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board37Data } from "./Screen";
export function useBoard37Data(): V2LiveResult<Board37Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
