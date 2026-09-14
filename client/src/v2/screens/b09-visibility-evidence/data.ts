import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board09Data } from "./Screen";

export function useBoard09Data(): V2LiveResult<Board09Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
