import { useEffect } from "react";

let portalScopeCount = 0;

export function useV2MonoPortalScope(): void {
  useEffect(() => {
    if (typeof document === "undefined") return;

    portalScopeCount += 1;
    document.body.classList.add("v2-mono-portal");

    return () => {
      portalScopeCount -= 1;
      if (portalScopeCount === 0) {
        document.body.classList.remove("v2-mono-portal");
      }
    };
  }, []);
}
