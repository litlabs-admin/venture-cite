import type { V2ScreenProps } from "@/v2/contracts/screen";
import { TodayLayout, type TodayData } from "../b01-today/shared/TodayLayout";

export type Board02Data = TodayData<"board02">;

export function Board02Screen({ data, staleAsOf }: V2ScreenProps<Board02Data>) {
  return <TodayLayout data={data} staleAsOf={staleAsOf} />;
}
