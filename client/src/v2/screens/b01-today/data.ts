import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board01Data } from "./Screen";

export function useBoard01Data(): V2LiveResult<Board01Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
