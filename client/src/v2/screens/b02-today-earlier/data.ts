import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board02Data } from "./Screen";

export function useBoard02Data(): V2LiveResult<Board02Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
