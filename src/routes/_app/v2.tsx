import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AuthenticatedBareRoute } from "../-shared/routeGates";
import { v2SearchSchema } from "../-shared/searchSchemas";
import { V2Shell } from "@/v2/shell/V2Shell";

// The gamified shell's layout route: it mounts V2Shell once for every
// `/v2/*` child, so the rail and the context bar survive navigation between
// them instead of remounting per screen.
//
// The gate is `AuthenticatedBareRoute` (routeGates.tsx), which renders NO
// AppShell - V2Shell is the chrome here, and mounting both would nest one
// 200px rail inside another. `AuthenticatedRoute` and `FirstRunGate` both
// mount AppShell, so neither can be used on this tree.
//
// A consequence worth stating, because it is the one behavioural difference
// from every other authenticated route: FirstRunGate is what redirects a
// user with no brands to /welcome, and this gate does not do that. A
// brand-less user therefore reaches `/v2/*` intact, and V2Shell renders its
// own labelled empty-brand placeholder rather than the silent gap
// BrandSelector.tsx:41 would leave (it returns null on `brands.length === 0`).
function V2Layout() {
  return (
    <V2Shell>
      <Outlet />
    </V2Shell>
  );
}

export const Route = createFileRoute("/_app/v2")({
  validateSearch: v2SearchSchema,
  component: () => <AuthenticatedBareRoute component={V2Layout} />,
  staticData: { v2Shell: "guided" },
});
