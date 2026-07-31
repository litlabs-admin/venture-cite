import { useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { usePersistedState } from "./use-persisted-state";
import type { Brand } from "@shared/schema";

const PERSIST_KEY = "vc_selected_brand_id";
const QUERY_PARAM = "brandId";

/**
 * Single source of truth for the currently-selected brand across the app.
 *
 * Selection precedence (industry-standard: URL > user preference > default):
 *   1. `?brandId=<id>` in the URL - bookmarkable and shareable
 *   2. last selection persisted to localStorage
 *   3. first brand in the user's brand list
 *
 * Writes flow back to the URL (via TanStack Router's navigate), which in turn
 * updates localStorage. Pages should read `selectedBrandId` from this hook
 * instead of holding their own useState, so navigating between feature pages
 * keeps the selection sticky.
 *
 * This hook is mounted from many different routes (it is not route-scoped),
 * so it reads/writes search with `{ strict: false }` / `to: "."` rather than
 * a specific route's typed search - see native-api-contract.md rule 3.
 */
export function useBrandSelection() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const [persistedId, setPersistedId] = usePersistedState<string>(PERSIST_KEY, "");

  const { data: brandsResponse, isLoading } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
  });
  const brands = useMemo(() => brandsResponse?.data ?? [], [brandsResponse]);

  const urlBrandId = useMemo(() => {
    const raw = (search as Record<string, unknown>)[QUERY_PARAM];
    return typeof raw === "string" ? raw : "";
  }, [search]);

  const resolvedBrandId = useMemo(() => {
    if (urlBrandId && brands.some((b) => b.id === urlBrandId)) return urlBrandId;
    if (persistedId && brands.some((b) => b.id === persistedId)) return persistedId;
    return brands[0]?.id ?? "";
  }, [urlBrandId, persistedId, brands]);

  // Keep persisted + URL in sync with the resolved selection (drives auto-pick
  // of first brand when user arrives without any selection).
  useEffect(() => {
    if (resolvedBrandId && resolvedBrandId !== persistedId) {
      setPersistedId(resolvedBrandId);
    }
  }, [resolvedBrandId, persistedId, setPersistedId]);

  const setSelectedBrandId = useCallback(
    (id: string) => {
      setPersistedId(id);
      navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => {
          const next = { ...prev };
          if (id) {
            next[QUERY_PARAM] = id;
          } else {
            delete next[QUERY_PARAM];
          }
          return next;
        },
        replace: true,
      });
    },
    [navigate, setPersistedId],
  );

  const selectedBrand = useMemo(
    () => brands.find((b) => b.id === resolvedBrandId),
    [brands, resolvedBrandId],
  );

  return {
    selectedBrandId: resolvedBrandId,
    setSelectedBrandId,
    brands,
    selectedBrand,
    isLoading,
  };
}
