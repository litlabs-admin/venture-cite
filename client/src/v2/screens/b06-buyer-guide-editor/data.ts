import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board06Data } from "./Screen";

export function useBoard06Data(): V2LiveResult<Board06Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
