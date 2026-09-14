import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board04Data } from "./Screen";

export function useBoard04Data(): V2LiveResult<Board04Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
