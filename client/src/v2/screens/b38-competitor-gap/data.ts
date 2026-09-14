import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board38Data } from "./Screen";
export function useBoard38Data(): V2LiveResult<Board38Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
