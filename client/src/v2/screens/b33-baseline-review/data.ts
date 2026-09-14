import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board33Data } from "./Screen";
export function useBoard33Data(): V2LiveResult<Board33Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
