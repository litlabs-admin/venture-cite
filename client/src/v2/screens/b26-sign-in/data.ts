import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board26Data } from "./Screen";
export function useBoard26Data(): V2LiveResult<Board26Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
