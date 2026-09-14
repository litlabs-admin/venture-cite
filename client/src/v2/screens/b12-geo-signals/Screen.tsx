import type { V2ScreenProps } from "@/v2/contracts/screen";
import { NotBuilt } from "../_placeholder/NotBuilt";

export type Board12Data = Record<string, never>;

export function Board12Screen(_props: V2ScreenProps<Board12Data>) {
  return <NotBuilt board="b12" title="Diagnostics - GEO signals" />;
}
