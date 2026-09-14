import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board13Data } from "./Screen";

export function useBoard13Data(): V2LiveResult<Board13Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
