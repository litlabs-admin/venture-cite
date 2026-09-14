// Live values: brand name, brand id, mode. This board shows no measurement
// by design (see Screen.tsx) - there is nothing else to read.
import type { V2LiveResult } from "@/v2/contracts/screen";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useV2Mode } from "@/v2/shell/useV2Mode";
import type { Board45Data } from "./Screen";

export function useBoard45Data(): V2LiveResult<Board45Data> {
  const { selectedBrandId, selectedBrand, isLoading } = useBrandSelection();
  const { mode } = useV2Mode();

  if (isLoading) return { state: { kind: "loading" } };
  if (!selectedBrandId) {
    return { state: { kind: "not-measured", reason: "Select a brand to begin setup." } };
  }

  return {
    state: { kind: "ready" },
    data: {
      brandId: selectedBrandId,
      mode,
      brand: { name: selectedBrand?.name ?? "" },
    },
  };
}
