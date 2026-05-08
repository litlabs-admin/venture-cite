// client/src/hooks/useTourReplay.ts
import { useCallback } from "react";

export function useTourReplay() {
  return useCallback((tourId: string) => {
    const fn = (window as unknown as { __replayTour?: (id: string) => void }).__replayTour;
    if (typeof fn === "function") fn(tourId);
  }, []);
}
