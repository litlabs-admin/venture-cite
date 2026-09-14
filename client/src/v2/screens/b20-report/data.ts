import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board20Data } from "./Screen";
export function useBoard20Data(): V2LiveResult<Board20Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
