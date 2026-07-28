import { createFileRoute } from "@tanstack/react-router";
import { SpineRedirect } from "../-shared/routeGates";

// See client/src/App.tsx's own comment on this path: the "share-of-answer"
// tab was removed from monitor.tsx, so SpineShell falls back to "overview".
// Preserved verbatim, unmodified — not this task's call to change.
export const Route = createFileRoute("/_app/ai-intelligence")({
  component: () => <SpineRedirect to="/monitor" tab="share-of-answer" />,
});
