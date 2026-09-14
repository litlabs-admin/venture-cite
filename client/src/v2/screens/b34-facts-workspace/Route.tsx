import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { FactsTabStrip } from "@/v2/brandfacts/FactsTabStrip";
import { StateView } from "../_placeholder/StateView";
import { Board34Screen } from "./Screen";
import { useBoard34Data } from "./data";

/**
 * `/v2/brand-facts/workspace`: the steady-state fact sheet.
 *
 * THE OTHER HALF OF BOARD 07's SELECTOR. A brand with literally zero facts
 * has nothing for this workspace to manage yet - per the board 34 spec's own
 * "Empty" state ("show the board 45 setup state or the board 07 fact
 * approval state" - `docs/superpowers/analysis/2026-09-14-screens/
 * 07-screen-specs-33-47.md`), that is board 07's screen, not a bespoke empty
 * workspace. This only fires on the RAW empty case (`useBrandFacts` returned
 * `[]`): a brand whose facts exist but are all dismissed still renders here
 * normally (`data.ts` excludes dismissed rows from the categories, not from
 * the "does this brand have facts at all" check) - otherwise this route and
 * board 07's own redirect (`../b07-brand-facts/Route.tsx`) would bounce a
 * fully-dismissed brand back and forth forever.
 */
export function Board34Route() {
  const result = useBoard34Data();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { selectedBrandId } = useBrandSelection();
  const data = result.data;
  const isEmptyBrand = result.state.kind === "empty" && data === undefined;

  useEffect(() => {
    if (!isEmptyBrand) return;
    navigate({
      to: "/v2/brand-facts",
      search: {
        brandId: selectedBrandId || undefined,
        mode: typeof search.mode === "string" ? search.mode : undefined,
      },
      replace: true,
    });
  }, [isEmptyBrand, navigate, selectedBrandId, search.mode]);

  const brandId = data?.navigation.brandId ?? selectedBrandId ?? "";
  const mode = data?.navigation.mode ?? (typeof search.mode === "string" ? search.mode : "guided");

  return (
    <div className="flex min-h-full flex-col">
      <FactsTabStrip active="workspace" brandId={brandId} mode={mode} />
      {isEmptyBrand ? null : data !== undefined ? (
        <Board34Screen
          data={data}
          staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
        />
      ) : (
        <StateView state={result.state} />
      )}
    </div>
  );
}
