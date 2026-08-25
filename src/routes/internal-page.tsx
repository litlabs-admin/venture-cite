import { createFileRoute } from "@tanstack/react-router";
import InternalPage from "@/pages/internal-page";

// PUBLIC board. This route sits at the top level, NOT under `_app`, and runs no
// gate, so anyone with the URL can read and edit every board and read the KPI
// dashboard. That is a deliberate decision by the repo owner: an earlier
// revision wrapped this in `AdminBareRoute`, and that wrapper was removed on
// purpose. The API side matches - see server/routes/board.ts and
// server/routes/internalKpis.ts, neither of which gates.
//
// This page now shows aggregate business figures (user counts, tier mix,
// paying customers, estimated MRR). They are aggregates only, never per-user
// rows, but they are readable by anyone who has the link.
//
// `noindex` keeps it out of search results, which is NOT access control - it
// only stops a crawler listing it, not a person who has the URL.
//
// To gate it again: wrap the component in `AdminBareRoute` here, add `isAdmin`
// in the two route files above, and drop their entries from PUBLIC_API_ROUTES
// in server/auth.ts.
export const Route = createFileRoute("/internal-page")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Board - VentureCite" },
      { name: "description", content: "The work board for VentureCite." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InternalPage,
});
