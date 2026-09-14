import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board03Data } from "./Screen";

export function useBoard03Data(): V2LiveResult<Board03Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
