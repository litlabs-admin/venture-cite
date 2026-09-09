import { createFileRoute } from "@tanstack/react-router";
import BrandFactsPage from "@/v2/brandfacts/BrandFactsPage";

// `/v2/brand-facts`.
//
// The dotted filename resolves to the nested path, so the route id is
// "/_app/v2/brand-facts" - the parent (`v2.tsx`) already carries the gate and
// the search schema, and neither is repeated here.
export const Route = createFileRoute("/_app/v2/brand-facts")({
  component: BrandFactsPage,
});
