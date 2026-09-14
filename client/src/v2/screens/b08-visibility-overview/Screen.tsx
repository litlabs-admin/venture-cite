import type { V2ScreenProps } from "@/v2/contracts/screen";
import { NotBuilt } from "../_placeholder/NotBuilt";

export type Board08Data = Record<string, never>;

export function Board08Screen(_props: V2ScreenProps<Board08Data>) {
  return <NotBuilt board="b08" title="Visibility - overview (Expert)" />;
}
