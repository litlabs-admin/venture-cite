import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board45Data } from "./Screen";
export function useBoard45Data(): V2LiveResult<Board45Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
