// client/src/pages/diagnose.tsx
//
// "What's wrong & why?" — one Issues canvas. Literal mirror of /act's
// single-panel structure. No tabs.

import { lazy } from "react";
import SpineShell from "@/components/SpineShell";

const DiagnoseIssues = lazy(() => import("@/components/diagnose/DiagnoseIssues"));

export default function Diagnose() {
  return (
    <SpineShell
      defaultTab="issues"
      tabs={[{ value: "issues", label: "Issues", icon: null as any, Component: DiagnoseIssues }]}
    />
  );
}
