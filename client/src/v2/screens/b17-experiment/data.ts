import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board17Data } from "./Screen";
export function useBoard17Data(): V2LiveResult<Board17Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
