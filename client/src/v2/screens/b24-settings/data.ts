import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board24Data } from "./Screen";
export function useBoard24Data(): V2LiveResult<Board24Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
