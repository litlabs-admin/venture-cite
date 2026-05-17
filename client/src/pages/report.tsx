import { lazy } from "react";
import { ClipboardList } from "lucide-react";
import SpineShell from "@/components/SpineShell";

// Phase 0 scaffold: embeds the existing client-reports page unchanged.
// Export + Schedule sub-tabs are added in later phases.
const ClientReports = lazy(() => import("@/pages/client-reports"));

export default function Report() {
  return (
    <SpineShell
      defaultTab="snapshot"
      tabs={[
        { value: "snapshot", label: "Snapshot", icon: ClipboardList, Component: ClientReports },
      ]}
    />
  );
}
