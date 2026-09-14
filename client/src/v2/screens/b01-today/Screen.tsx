import type { V2ScreenProps } from "@/v2/contracts/screen";
import { TodayLayout, type TodayData } from "./shared/TodayLayout";

export type Board01Data = TodayData<"board01">;

export function Board01Screen({ data, staleAsOf }: V2ScreenProps<Board01Data>) {
  return <TodayLayout data={data} staleAsOf={staleAsOf} />;
}
