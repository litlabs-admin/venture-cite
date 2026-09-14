import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board41Data } from "./Screen";
export function useBoard41Data(): V2LiveResult<Board41Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
