import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board12Data } from "./Screen";

export function useBoard12Data(): V2LiveResult<Board12Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
