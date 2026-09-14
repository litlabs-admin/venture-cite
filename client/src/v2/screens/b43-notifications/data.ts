import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board43Data } from "./Screen";
export function useBoard43Data(): V2LiveResult<Board43Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
