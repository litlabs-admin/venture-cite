import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board07Data } from "./Screen";

export function useBoard07Data(): V2LiveResult<Board07Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
