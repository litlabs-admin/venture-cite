import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Brand facts: the reads and the two writes the review gate is allowed to make.
//
// QUERY KEYS ARE NAMESPACED `["v2", ...]`, for the reason `workSummary.ts`
// gives: the query client is a singleton shared with the live dashboard, so a
// key shaped like the live app's would let an invalidation from this tree
// re-render the live dashboard, and the default queryFn would try to build a
// URL out of the key.
//
// THREE ENVELOPES, NOT ONE. The endpoints this screen calls do not agree on a
// response shape, and pretending they do would silently read `undefined`:
//   GET   /api/brand-facts/:brandId                       -> { success, data }
//   PATCH /api/brand-facts/:id                            -> { success, data }
//   POST  /api/brand-fact-sheet/facts/:factId/accept      -> { success, fact }
//   POST  /api/brand-fact-sheet/facts/:factId/dismiss     -> { success, fact }
// Each reader below names the field it actually reads.

/**
 * A row of `brand_fact_sheet` as `GET /api/brand-facts/:brandId` projects it
 * (`storage.getBrandFacts`, which dedupes across sources and returns whole
 * rows). Only the columns this screen reads are declared.
 *
 * `confidence` is a Postgres `numeric`, and the driver hands numerics back as
 * strings. It is typed as it arrives rather than as it would be convenient,
 * so nothing here does arithmetic on a string by accident.
 */
export type BrandFactView = {
  id: string;
  brandId: string;
  domain: string;
  subcategory: string;
  factKey: string;
  factValue: string;
  confidence: string | number | null;
  /** The 200-char snippet the value was read out of. Nullable in the schema. */
  sourceExcerpt: string | null;
  sourceUrl: string | null;
  source: string;
  acceptedAt: string | null;
  dismissedAt: string | null;
  lastVerified: string | null;
};

async function readData<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  const payload = (await response.json()) as { success: boolean; data: T };
  return payload.data;
}

/** Every fact the brand has. An empty array is a real answer, not an error:
 *  a brand nothing has been extracted for yet returns `[]` with a 200. */
export function useBrandFacts(brandId: string | undefined) {
  return useQuery<BrandFactView[]>({
    queryKey: ["v2", "brand-facts", brandId],
    enabled: Boolean(brandId),
    // The screen renders its own error block, so the global query toast would
    // report the same failure twice.
    meta: { suppressErrorToast: true },
    queryFn: () => readData<BrandFactView[]>(`/api/brand-facts/${encodeURIComponent(brandId!)}`),
  });
}

/**
 * Approve the extracted value exactly as it stands.
 *
 * This is one of the review gate's two explicit actions. It is never called
 * from an effect, from a render, or from another fact's approval - the person
 * has to press the control that carries this fact's own value.
 */
export function useApproveFact(brandId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (factId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/brand-fact-sheet/facts/${encodeURIComponent(factId)}/accept`,
        // The conflict-resolution flag. This screen reviews one fact at a
        // time and never decides the fate of a row it has not shown, so it
        // stays false.
        { dismissOtherSide: false },
      );
      const payload = (await response.json()) as { success: boolean; fact: BrandFactView };
      return payload.fact;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["v2", "brand-facts", brandId] });
    },
  });
}

/**
 * Amend the value, then approve the amended value.
 *
 * Two calls, because the API has no single one. `PATCH /api/brand-facts/:id`
 * writes `factValue` and does NOT stamp `accepted_at`
 * (`routes/intelligence.ts`, `storage.updateBrandFact`); only the accept
 * endpoint does. So "the owner made the required change" would otherwise
 * leave the fact still unreviewed, and the screen would ask for the same
 * decision again on the next visit.
 *
 * The order matters and the failure is reported honestly: if the PATCH
 * succeeds and the accept then fails, the new value IS saved and the fact is
 * NOT approved. `stage` says which happened so the caller can say so rather
 * than claim a clean failure.
 */
export class FactAmendError extends Error {
  constructor(
    message: string,
    readonly stage: "save" | "approve",
  ) {
    super(message);
    this.name = "FactAmendError";
  }
}

export function useAmendFact(brandId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ factId, factValue }: { factId: string; factValue: string }) => {
      try {
        await apiRequest("PATCH", `/api/brand-facts/${encodeURIComponent(factId)}`, { factValue });
      } catch (error) {
        throw new FactAmendError((error as Error).message, "save");
      }
      try {
        const response = await apiRequest(
          "POST",
          `/api/brand-fact-sheet/facts/${encodeURIComponent(factId)}/accept`,
          { dismissOtherSide: false },
        );
        const payload = (await response.json()) as { success: boolean; fact: BrandFactView };
        return payload.fact;
      } catch (error) {
        throw new FactAmendError((error as Error).message, "approve");
      }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["v2", "brand-facts", brandId] });
    },
  });
}
