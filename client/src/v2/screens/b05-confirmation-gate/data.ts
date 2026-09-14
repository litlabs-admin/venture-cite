import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board05Data } from "./Screen";

export function useBoard05Data(): V2LiveResult<Board05Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
