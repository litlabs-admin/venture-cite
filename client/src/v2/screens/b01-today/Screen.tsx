import type { V2ScreenProps } from "@/v2/contracts/screen";
import { TodayLayout, type TodayData } from "./shared/TodayLayout";

export type Board01Data = TodayData<"board01">;

export function Board01Screen({
  data,
  staleAsOf,
  onRefetchVisibility,
}: V2ScreenProps<Board01Data> & { onRefetchVisibility?: () => void }) {
  return (
    <TodayLayout data={data} staleAsOf={staleAsOf} onRefetchVisibility={onRefetchVisibility} />
  );
}
