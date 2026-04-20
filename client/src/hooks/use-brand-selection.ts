import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePersistedState } from "./use-persisted-state";
import type { Brand } from "@shared/schema";

const PERSIST_KEY = "vc_selected_brand_id";
const QUERY_PARAM = "brandId";

/**
 * Single source of truth for the currently-selected brand across the app.
 *
 * Selection precedence (industry-standard: URL > user preference > default):
 *   1. `?brandId=<id>` in the URL — bookmarkable and shareable
 *   2. last selection persisted to localStorage
 *   3. first brand in the user's brand list
 *
 * Writes flow back to the URL (via wouter), which in turn updates localStorage.
 * Pages should read `selectedBrandId` from this hook instead of holding their
 * own useState, so navigating between feature pages keeps the selection sticky.
 */
export function useBrandSelection() {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  const [persistedId, setPersistedId] = usePersistedState<string>(PERSIST_KEY, "");

  const { data: brandsResponse, isLoading } = useQuery<{ success: boolean; data: Brand[] }>({
    queryKey: ["/api/brands"],
  });
  const brands = useMemo(() => brandsResponse?.data ?? [], [brandsResponse]);

  const urlBrandId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get(QUERY_PARAM) ?? "";
  }, [searchString]);

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
      const params = new URLSearchParams(searchString);
      if (id) {
        params.set(QUERY_PARAM, id);
      } else {
        params.delete(QUERY_PARAM);
      }
      const qs = params.toString();
      const path = location.split("?")[0];
      setLocation(qs ? `${path}?${qs}` : path, { replace: true });
    },
    [location, searchString, setLocation, setPersistedId],
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
