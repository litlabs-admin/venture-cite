import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board32Data } from "./Screen";
export function useBoard32Data(): V2LiveResult<Board32Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
