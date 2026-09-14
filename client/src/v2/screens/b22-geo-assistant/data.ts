import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board22Data } from "./Screen";
export function useBoard22Data(): V2LiveResult<Board22Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
