import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board39Data } from "./Screen";
export function useBoard39Data(): V2LiveResult<Board39Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
