import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board14Data } from "./Screen";

export function useBoard14Data(): V2LiveResult<Board14Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
