import type { V2ScreenProps } from "@/v2/contracts/screen";
import {
  ContentTaskEditor,
  type ContentTaskActions,
  type ContentTaskData,
} from "./shared/ContentTaskEditor";

export type Board06Data = ContentTaskData<"buyer-guide">;

export function Board06Screen({
  data,
  staleAsOf,
  actions,
}: V2ScreenProps<Board06Data> & { actions?: ContentTaskActions }) {
  return <ContentTaskEditor actions={actions} data={data} staleAsOf={staleAsOf} />;
}
