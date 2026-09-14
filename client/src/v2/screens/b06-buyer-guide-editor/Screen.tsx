import type { V2ScreenProps } from "@/v2/contracts/screen";
import { ContentTaskEditor, type ContentTaskData } from "./shared/ContentTaskEditor";

export type Board06Data = ContentTaskData<"buyer-guide">;

export function Board06Screen({ data, staleAsOf }: V2ScreenProps<Board06Data>) {
  return <ContentTaskEditor data={data} staleAsOf={staleAsOf} />;
}
