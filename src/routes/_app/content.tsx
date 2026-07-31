import { lazy } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "../-shared/routeGates";
import { contentSearchSchema } from "../-shared/searchSchemas";

// Lazy, matching client/src/App.tsx. Content is also mounted at
// /content/:articleId (see content.$articleId.tsx) - the component itself
// resolves which via TanStack's useParams({ strict: false }) internally (a
// standalone match against whichever of the two routes actually matched),
// so both route files intentionally point at the exact same component with
// no param plumbing here.
const Content = lazy(() => import("@/pages/content"));

export const Route = createFileRoute("/_app/content")({
  validateSearch: contentSearchSchema,
  component: () => <AuthenticatedRoute component={Content} />,
});
