import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board08Data } from "./Screen";

export function useBoard08Data(): V2LiveResult<Board08Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
