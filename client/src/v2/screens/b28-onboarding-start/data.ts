import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board28Data } from "./Screen";
export function useBoard28Data(): V2LiveResult<Board28Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
