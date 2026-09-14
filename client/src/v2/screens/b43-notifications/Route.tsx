import { StateView } from "../_placeholder/StateView";
import { Board43Screen } from "./Screen";
import {
  useBoard43Data,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useUpdateNotificationSettings,
} from "./data";

export function Board43Route() {
  const result = useBoard43Data();
  const brandId = result.data?.brandId ?? "";
  const markRead = useMarkNotificationRead(brandId);
  const markAllRead = useMarkAllNotificationsRead(brandId);
  const updateSettings = useUpdateNotificationSettings(brandId);

  if (result.data !== undefined) {
    return (
      <Board43Screen
        data={result.data}
        onMarkAllRead={(keys) => markAllRead.mutate(keys)}
        onMarkRead={(key) => markRead.mutate(key)}
        onSettingsChange={(patch) => updateSettings.mutate(patch)}
        staleAsOf={result.state.kind === "stale" ? result.state.asOf : undefined}
      />
    );
  }
  return <StateView state={result.state} />;
}
