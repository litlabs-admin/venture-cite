import { createFileRoute } from "@tanstack/react-router";
import BrandFactsPage from "@/v2/brandfacts/BrandFactsPage";

export const Route = createFileRoute("/_app/v2/brand-facts/")({
  component: BrandFactsPage,
  staticData: { v2Shell: "guided", v2Board: "b07" },
});
