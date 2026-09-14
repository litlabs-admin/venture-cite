import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board44Data } from "./Screen";
export function useBoard44Data(): V2LiveResult<Board44Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
