import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board21Data } from "./Screen";
export function useBoard21Data(): V2LiveResult<Board21Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
