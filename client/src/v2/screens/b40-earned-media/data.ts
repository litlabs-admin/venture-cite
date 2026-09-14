import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board40Data } from "./Screen";
export function useBoard40Data(): V2LiveResult<Board40Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
