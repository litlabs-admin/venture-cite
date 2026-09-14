import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board11Data } from "./Screen";

export function useBoard11Data(): V2LiveResult<Board11Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
