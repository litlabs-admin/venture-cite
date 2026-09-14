import type { BoardId } from "@/v2/contracts/screen";

export type SettingsTab = {
  label: string;
  route: string;
  board: BoardId;
};

export const SETTINGS_TABS = [
  { label: "Brand", route: "/v2/settings", board: "b24" },
  { label: "Measurement", route: "/v2/settings", board: "b24" },
  { label: "Team", route: "/v2/settings/team", board: "b42" },
  { label: "Notifications", route: "/v2/notifications", board: "b43" },
  { label: "Privacy", route: "/privacy", board: "b24" },
] as const satisfies readonly SettingsTab[];
