import type { V2ScreenProps } from "@/v2/contracts/screen";
import { NotBuilt } from "../_placeholder/NotBuilt";

export type Board10Data = Record<string, never>;

export function Board10Screen(_props: V2ScreenProps<Board10Data>) {
  return <NotBuilt board="b10" title="Visibility - results review (Guided)" />;
}
