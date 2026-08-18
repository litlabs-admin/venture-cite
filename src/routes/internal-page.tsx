import { createFileRoute } from "@tanstack/react-router";
import InternalPage from "@/pages/internal-page";

// Public board. This route sits at the top level, NOT under `_app`, so no
// authentication gate runs. Anyone with the URL can read and edit the board.
// The board holds no customer data: it lives in this browser's localStorage
// and never reaches the server.
//
// `noindex` keeps it out of search results. A search engine that indexed this
// page would publish the work list on every results page.
export const Route = createFileRoute("/internal-page")({
  head: () => ({
    meta: [
      { title: "Board - VentureCite" },
      { name: "description", content: "The work board for VentureCite." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InternalPage,
});
