import { useCallback, useState } from "react";
import type { V2Mode } from "@/v2/contracts/shell";

const STORAGE_KEY = "vc.v2.mode";

function readStoredMode(): V2Mode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "expert" ? "expert" : "guided";
  } catch {
    return "guided";
  }
}

export function useV2Mode(): {
  mode: V2Mode;
  setMode: (mode: V2Mode) => void;
} {
  const [mode, setModeState] = useState<V2Mode>(readStoredMode);

  const setMode = useCallback((nextMode: V2Mode) => {
    setModeState(nextMode);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // The in-memory mode remains usable when browser storage is unavailable.
    }
  }, []);

  return { mode, setMode };
}
