import type { V2ScreenProps } from "@/v2/contracts/screen";
import { NotBuilt } from "../_placeholder/NotBuilt";

export type Board01Data = Record<string, never>;

export function Board01Screen(_props: V2ScreenProps<Board01Data>) {
  return <NotBuilt board="b01" title="Today (Guided)" />;
}
