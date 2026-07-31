import { createFileRoute, Navigate } from "@tanstack/react-router";

// /home2 was where the homepage was built; it is the homepage now.
// Redirect rather than 404 so existing links keep working. Verbatim
// behaviour from client/src/App.tsx's <Route path="/home2"> (that file is
// deleted as of Phase 2 Task 6a; see src/routes/__root.tsx and the Task 6a
// report for where its other pieces went).
//
// Phase 2 Task 6a: wouter's <Redirect> swapped for TanStack Router's own
// <Navigate>, imported directly from "@tanstack/react-router" rather than
// the router-compat shim (@/lib/router-compat) - see
// src/routes/-shared/routeGates.tsx, which now also uses native <Navigate>
// (Phase 2 Task 7 deleted the shim's local Redirect helper). "/" is a real
// route in this tree, so `to` (not `href`) type-checks here.
export const Route = createFileRoute("/_app/home2")({
  component: () => <Navigate to="/" />,
});
