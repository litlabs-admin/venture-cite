import { createFileRoute } from "@tanstack/react-router";
import { SpineRedirect } from "../-shared/routeGates";

// The "share-of-answer" tab this used to redirect to no longer exists in
// monitor.tsx (its prompt_portfolio backing table is dead - see
// client/src/pages/monitor.tsx:13-17), so SpineShell was silently falling
// back to "citations" via SpineShell.tsx's active-tab resolution. Per
// monitor.tsx:13-15, "Trends is the analytical half of the dissolved
// ai-intelligence page" - that's the concrete surviving surface this route
// conceptually maps to, so redirect there explicitly instead of relying on
// an accidental fallback.
export const Route = createFileRoute("/_app/ai-intelligence")({
  component: () => <SpineRedirect to="/monitor" tab="trends" />,
});
