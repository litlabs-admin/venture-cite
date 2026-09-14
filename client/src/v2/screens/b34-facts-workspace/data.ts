import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board34Data } from "./Screen";
export function useBoard34Data(): V2LiveResult<Board34Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
