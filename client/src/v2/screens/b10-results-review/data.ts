import type { V2LiveResult } from "@/v2/contracts/screen";
import type { Board10Data } from "./Screen";

export function useBoard10Data(): V2LiveResult<Board10Data> {
  return { state: { kind: "not-measured", reason: "This screen is not built yet." } };
}
