import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board27Data } from "./Screen";
export function useBoard27Data(): V2LiveResult<Board27Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
