import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board15Data } from "./Screen";

export function useBoard15Data(): V2LiveResult<Board15Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
