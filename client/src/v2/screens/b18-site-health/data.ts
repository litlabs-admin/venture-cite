import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board18Data } from "./Screen";
export function useBoard18Data(): V2LiveResult<Board18Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
