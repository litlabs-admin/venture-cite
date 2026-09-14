import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board23Data } from "./Screen";
export function useBoard23Data(): V2LiveResult<Board23Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
