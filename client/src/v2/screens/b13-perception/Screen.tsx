import type { V2ScreenProps } from "@/v2/contracts/screen";
import { NotBuilt } from "../_placeholder/NotBuilt";

export type Board13Data = Record<string, never>;

export function Board13Screen(_props: V2ScreenProps<Board13Data>) {
  return <NotBuilt board="b13" title="Diagnostics - perception (Expert)" />;
}
