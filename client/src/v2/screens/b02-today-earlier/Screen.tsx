import type { V2ScreenProps } from "@/v2/contracts/screen";
import { TodayLayout, type TodayData } from "../b01-today/shared/TodayLayout";

export type Board02Data = TodayData<"board02">;

export function Board02Screen({
  data,
  staleAsOf,
  onRefetchVisibility,
}: V2ScreenProps<Board02Data> & { onRefetchVisibility?: () => void }) {
  return (
    <TodayLayout data={data} staleAsOf={staleAsOf} onRefetchVisibility={onRefetchVisibility} />
  );
}
