import type { V2ScreenProps } from "@/v2/contracts/screen";
import {
  ContentTaskEditor,
  type ContentTaskActions,
  type ContentTaskData,
} from "../b06-buyer-guide-editor/shared/ContentTaskEditor";

export type Board19Data = ContentTaskData<"services">;

export function Board19Screen({
  data,
  staleAsOf,
  actions,
}: V2ScreenProps<Board19Data> & { actions?: ContentTaskActions }) {
  return <ContentTaskEditor actions={actions} data={data} staleAsOf={staleAsOf} />;
}
