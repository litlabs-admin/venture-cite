// client/src/pages/monitor.tsx
//
// "Where do I stand?" — one Visibility canvas. The /monitor consolidation
// dropped its tab strip (precedent: /act after its rework). Legacy ?tab=*
// values still arrive but resolve to the constant "Visibility" title.

import { lazy } from "react";
import SpineShell from "@/components/SpineShell";

const MonitorVisibility = lazy(() => import("@/components/monitor/MonitorVisibility"));

export default function Monitor() {
  return (
    <SpineShell
      defaultTab="visibility"
      tabs={[
        {
          value: "visibility",
          label: "Visibility",
          icon: null as any,
          Component: MonitorVisibility,
        },
      ]}
    />
  );
}
