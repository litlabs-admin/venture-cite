import { createFileRoute } from "@tanstack/react-router";
import { SpineRedirect } from "../-shared/routeGates";

// The standalone prompts list has no entry in the workflow-spine nav
// (Dashboard / Setup / Monitor / Diagnose / Act / Report), so landing on it -
// from a panel link, a bookmark, or a typed URL - stranded the reader outside
// the workflow. Monitor's citations -> Prompts tab is the same list inside the
// spine, and it is where every row that opens /prompts/$promptId already
// lives, so send /prompts there.
//
// Redirecting at the route, not just at the link, is what makes "nothing goes
// to /prompts" true for paths no DEST entry controls. This is the index route
// only: /prompts/$promptId and /prompts/$promptId/diagnose are unaffected.
export const Route = createFileRoute("/_app/prompts/")({
  component: () => <SpineRedirect to="/monitor" tab="citations" ptab="prompts" />,
});
