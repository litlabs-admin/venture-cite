import type { V2ScreenProps } from "@/v2/contracts/screen";
import { NotBuilt } from "../_placeholder/NotBuilt";

export type Board02Data = Record<string, never>;

export function Board02Screen(_props: V2ScreenProps<Board02Data>) {
  return <NotBuilt board="b02" title="Today - earlier state (Guided)" />;
}
