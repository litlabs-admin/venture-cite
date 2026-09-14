import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board36Data } from "./Screen";
export function useBoard36Data(): V2LiveResult<Board36Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
