import type { V2ScreenProps } from "@/v2/contracts/screen";
import {
  ContentTaskEditor,
  type ContentTaskData,
} from "../b06-buyer-guide-editor/shared/ContentTaskEditor";

export type Board19Data = ContentTaskData<"services">;

export function Board19Screen({ data, staleAsOf }: V2ScreenProps<Board19Data>) {
  return <ContentTaskEditor data={data} staleAsOf={staleAsOf} />;
}
