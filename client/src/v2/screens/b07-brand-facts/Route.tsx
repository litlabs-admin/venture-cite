import { useEffect, useMemo, type ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { FactsTabStrip } from "@/v2/brandfacts/FactsTabStrip";
import { StateView } from "../_placeholder/StateView";
import { Board07Screen } from "./Screen";
import { useBoard07Data } from "./data";

/**
 * `/v2/brand-facts`: the Level 1 setup gate.
 *
 * WHY THIS REDIRECTS, AND WHY THE CHECK LIVES HERE. Per
 * `docs/superpowers/analysis/2026-09-14-screens/09-verification-B.md` §405:
 * "07 is the Level 1 setup state ... 34 is the steady-state workspace. The
 * selector is the level, or the `approve_essential_brand_facts` completion."
 * Once every essential fact has an owner's decision on it (confirmed or
 * dismissed - `factReview()` in `./data.ts`), this screen has nothing left to
 * gate: the setup review is done, and the workspace (board 34) is where the
 * fact sheet lives from here on. This route owns the check, not
 * `v2.brand-facts.index.tsx`, because it is the same data this screen already
 * loaded to render the table - a second fetch at the route layer would just
 * race this one.
 *
 * A brand with facts but none of them still `needs-review` is "done" even if
 * every one of them was DISMISSED rather than confirmed: the setup step this
 * gate exists for is "look at what was extracted and decide", and dismissing
 * a bad extraction is a decision, not an unfinished one. Board 34 handles
 * that edge on its own side (an all-dismissed brand still reads as `ready`
 * there, never as `empty`), so the two routes cannot bounce each other back
 * and forth.
 */
export function Board07Route() {
  const result = useBoard07Data();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const data = result.data;

  const allApproved = useMemo(
    () =>
      data !== undefined &&
      data.facts.length > 0 &&
      data.facts.every((fact) => fact.review.kind !== "needs-review"),
    [data],
  );

  useEffect(() => {
    if (!allApproved || data === undefined) return;
    navigate({
      to: "/v2/brand-facts/workspace",
      search: { brandId: data.navigation.brandId, mode: data.navigation.mode },
      replace: true,
    });
  }, [allApproved, data, navigate]);

  const brandId =
    data?.navigation.brandId ?? (typeof search.brandId === "string" ? search.brandId : "");
  const mode = data?.navigation.mode ?? (typeof search.mode === "string" ? search.mode : "guided");

  let body: ReactNode;
  if (allApproved) {
    // The effect above is already navigating away. Rendering nothing here
    // (rather than the table one more time) avoids a flash of "needs review"
    // rows for a brand that just finished reviewing them.
    body = null;
  } else if (data !== undefined) {
    body = (
      <Board07Screen
        data={data}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  } else {
    body = <StateView state={result.state} />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <FactsTabStrip active="setup" brandId={brandId} mode={mode} />
      {body}
    </div>
  );
}
