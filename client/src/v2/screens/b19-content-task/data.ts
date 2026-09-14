import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board19Data } from "./Screen";
export function useBoard19Data(): V2LiveResult<Board19Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
