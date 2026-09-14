import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board35Data } from "./Screen";
export function useBoard35Data(): V2LiveResult<Board35Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
