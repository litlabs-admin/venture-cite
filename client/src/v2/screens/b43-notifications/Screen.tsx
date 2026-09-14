import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import type { V2IconName } from "@/v2/contracts/icons";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { EmptyState } from "@/v2/shared/ui/EmptyState";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { v2ToneClasses, type V2Tone } from "@/v2/shared/ui/shared";
import { UnderlineTabs } from "@/v2/shared/ui/UnderlineTabs";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";

export type Board43NotificationCategory = "needs_action" | "updates" | "completed";

export type Board43Target =
  | { kind: "brand-facts-workspace" }
  | { kind: "visibility-evidence" }
  | { kind: "task-detail"; taskId: string };

export type Board43Notification = {
  key: string;
  category: Board43NotificationCategory;
  /** Drives icon/tone (KIND_STYLE) and is otherwise opaque to the screen. */
  kind: string;
  title: string;
  description: string;
  evidenceTitle: string;
  evidenceType: string;
  /** ISO datetime. */
  occurredAt: string;
  target: Board43Target;
  actionLabel: string;
  read: boolean;
};

export type Board43Settings = {
  emailEnabled: boolean;
  slackEnabled: boolean;
  /** Whether a Slack webhook is on file for this brand. */
  slackConnected: boolean;
  weeklyReportEnabled: boolean;
};

export type Board43Data = {
  brandId: string;
  mode: "guided" | "expert";
  brandName: string;
  notifications: Board43Notification[];
  settings: Board43Settings;
};

/** Optional: absent in the preview binding (registry.ts's bindScreen), which
 *  calls this component with only { data, staleAsOf }. The live Route wires
 *  the real handlers in. */
export type Board43Actions = {
  onMarkRead?: (key: string) => void;
  onMarkAllRead?: (keys: string[]) => void;
  onSettingsChange?: (patch: Partial<Board43Settings>) => void;
};

type Board43Tab = "needs_action" | "updates" | "completed";

const TAB_ITEMS: ReadonlyArray<{ value: Board43Tab; label: string }> = [
  { value: "needs_action", label: "Needs action" },
  { value: "updates", label: "Updates" },
  { value: "completed", label: "Completed" },
];

const KIND_STYLE: Record<string, { icon: V2IconName; tone: V2Tone }> = {
  fact_conflict: { icon: "warn", tone: "bad" },
  visibility_drop: { icon: "chart", tone: "warn" },
  prompts_lost: { icon: "chart", tone: "warn" },
  new_hallucinations: { icon: "warn", tone: "warn" },
  measurement_failed: { icon: "warn", tone: "bad" },
  results_ready: { icon: "check", tone: "ok" },
  task_needs_review: { icon: "doc", tone: "brand" },
  task_completed: { icon: "check", tone: "ok" },
};

function kindStyle(kind: string): { icon: V2IconName; tone: V2Tone } {
  return KIND_STYLE[kind] ?? { icon: "bell", tone: "neutral" };
}

function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Today" / "This week" / "Earlier", matching the approved board's groups. */
function groupOf(occurredAt: string, now: Date): string {
  const diffDays = Math.round((dayStart(now) - dayStart(new Date(occurredAt))) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays <= 7) return "This week";
  return "Earlier";
}

function formatTimestamp(iso: string): ReactNode {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const day = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return (
    <>
      {day}
      <br />
      {time}
    </>
  );
}

function NotificationLink({
  target,
  brandId,
  mode,
  className,
  children,
  onClick,
}: {
  target: Board43Target;
  brandId: string;
  mode: Board43Data["mode"];
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const search = { brandId, mode };
  if (target.kind === "task-detail") {
    return (
      <Link
        className={className}
        onClick={onClick}
        params={{ taskId: target.taskId }}
        search={search}
        to="/v2/my-work/tasks/$taskId"
      >
        {children}
      </Link>
    );
  }
  if (target.kind === "brand-facts-workspace") {
    return (
      <Link className={className} onClick={onClick} search={search} to="/v2/brand-facts/workspace">
        {children}
      </Link>
    );
  }
  return (
    <Link className={className} onClick={onClick} search={search} to="/v2/visibility/evidence">
      {children}
    </Link>
  );
}

function NotificationItemCell({ item }: { item: Board43Notification }) {
  const style = kindStyle(item.kind);
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full",
          v2ToneClasses[style.tone],
        )}
      >
        <V2Icon name={style.icon} size={14} />
      </span>
      <div className="min-w-0">
        <p className={cn(v2Type.bodyStrong, !item.read && "font-semibold")}>{item.title}</p>
        <p className={cn(v2Type.meta, "mt-0.5")}>{item.description}</p>
      </div>
    </div>
  );
}

function groupHeaderFor(rows: readonly Board43Notification[], now: Date) {
  const labels = rows.map((row) => groupOf(row.occurredAt, now));
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return (_row: Board43Notification, index: number): ReactNode => {
    if (index > 0 && labels[index] === labels[index - 1]) return null;
    return `${labels[index]} (${counts.get(labels[index])})`;
  };
}

function NotificationsTable({
  brandId,
  mode,
  rows,
  onMarkRead,
}: {
  brandId: string;
  mode: Board43Data["mode"];
  rows: Board43Notification[];
  onMarkRead?: (key: string) => void;
}) {
  // `now` only needs to be "recent enough" to bucket rows into Today / This
  // week / Earlier - recomputing it per render (not memoized) keeps the
  // dependency list honest without a stale-closure risk.
  const groupHeader = useMemo(() => groupHeaderFor(rows, new Date()), [rows]);

  const columns: readonly DataColumn<Board43Notification>[] = [
    {
      key: "title",
      header: "Item",
      className: "w-[34%]",
      render: (item) => <NotificationItemCell item={item} />,
    },
    {
      key: "evidenceTitle",
      header: "Evidence",
      render: (item) => (
        <div>
          <div>{item.evidenceTitle}</div>
          <div className={v2Type.meta}>{item.evidenceType}</div>
        </div>
      ),
    },
    {
      key: "occurredAt",
      header: "Time",
      wrap: false,
      render: (item) => <span className={v2Type.meta}>{formatTimestamp(item.occurredAt)}</span>,
    },
    {
      key: "actionLabel",
      header: "Action",
      wrap: false,
      render: (item) => (
        <div className="flex items-center gap-2">
          <Button asChild className="h-8 shrink-0 rounded-lg text-[12.5px]" size="sm">
            <NotificationLink
              brandId={brandId}
              mode={mode}
              onClick={() => onMarkRead?.(item.key)}
              target={item.target}
            >
              {item.actionLabel}
            </NotificationLink>
          </Button>
          {!item.read ? (
            <button
              className={cn(
                v2Type.meta,
                "shrink-0 underline underline-offset-2 hover:text-[color:var(--v2-ink)]",
              )}
              onClick={() => onMarkRead?.(item.key)}
              type="button"
            >
              Mark read
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      className="mt-2"
      columns={columns}
      emptyMessage={
        <EmptyState description="Nothing here right now." icon="doc" title="No updates" />
      }
      groupHeader={groupHeader}
      rowKey={(item) => item.key}
      rows={rows}
    />
  );
}

type SettingRowProps = {
  icon: V2IconName;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

function SettingRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: SettingRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-[var(--v2-line)] py-4 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 gap-2.5">
        <V2Icon name={icon} size={17} />
        <div className="min-w-0">
          <p className={v2Type.bodyStrong}>{title}</p>
          <p className={cn(v2Type.meta, "mt-0.5")}>{description}</p>
        </div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function NotificationSettingsRail({
  settings,
  onSettingsChange,
}: {
  settings: Board43Settings;
  onSettingsChange?: (patch: Partial<Board43Settings>) => void;
}) {
  return (
    <aside className="min-w-0" aria-label="Notification settings">
      <h2 className={v2Type.sectionTitle}>Notification settings</h2>
      <p className={cn(v2Type.meta, "mt-1.5")}>
        Choose how and when you want to be notified about important updates.
      </p>
      <div className="mt-4">
        <SettingRow
          checked={settings.emailEnabled}
          description="Fact conflicts, failed measurements, and task updates."
          icon="mail"
          onCheckedChange={(checked) => onSettingsChange?.({ emailEnabled: checked })}
          title="Email notifications"
        />
        <SettingRow
          checked={settings.slackEnabled && settings.slackConnected}
          description={
            settings.slackConnected
              ? "Send the same updates to your connected Slack workspace."
              : "No Slack workspace is connected yet."
          }
          disabled={!settings.slackConnected}
          icon="slack"
          onCheckedChange={(checked) => onSettingsChange?.({ slackEnabled: checked })}
          title="Slack notifications"
        />
        <SettingRow
          checked={settings.weeklyReportEnabled}
          description="A summary of results and activity every Monday."
          icon="chart"
          onCheckedChange={(checked) => onSettingsChange?.({ weeklyReportEnabled: checked })}
          title="Weekly report"
        />
      </div>
    </aside>
  );
}

export function Board43Screen({
  data,
  onMarkRead,
  onMarkAllRead,
  onSettingsChange,
}: V2ScreenProps<Board43Data> & Board43Actions) {
  const [tab, setTab] = useState<Board43Tab>("needs_action");

  const counts = useMemo(() => {
    const result: Record<Board43Tab, number> = { needs_action: 0, updates: 0, completed: 0 };
    for (const item of data.notifications) {
      if (!item.read) result[item.category] += 1;
    }
    return result;
  }, [data.notifications]);

  const unreadKeys = useMemo(
    () => data.notifications.filter((item) => !item.read).map((item) => item.key),
    [data.notifications],
  );

  const visible = useMemo(
    () => data.notifications.filter((item) => item.category === tab),
    [data.notifications, tab],
  );

  const tabs = TAB_ITEMS.map((item) => ({ ...item, count: counts[item.value] }));

  return (
    <div
      className="min-h-full text-[14px] leading-[1.5] text-[color:var(--v2-ink)]"
      data-testid="board43-screen"
    >
      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_322px]">
        <main className="min-w-0 px-6 py-7">
          <PageHeader
            actions={
              <Button
                disabled={unreadKeys.length === 0}
                onClick={() => onMarkAllRead?.(unreadKeys)}
                variant="outline"
              >
                Mark all read
              </Button>
            }
            sub="Stay on top of what matters. Review and take action to keep your evidence complete and accurate."
            title="Updates that need your attention"
          />
          <UnderlineTabs
            className="mt-6"
            items={tabs.map((item) => ({
              value: item.value,
              label: item.label,
              count: item.count,
            }))}
            onChange={(value) => setTab(value as Board43Tab)}
            value={tab}
          />
          <NotificationsTable
            brandId={data.brandId}
            mode={data.mode}
            onMarkRead={onMarkRead}
            rows={visible}
          />
        </main>
        <aside className="border-t border-[var(--v2-line)] px-7 py-7 md:border-t-0 md:border-l">
          <NotificationSettingsRail onSettingsChange={onSettingsChange} settings={data.settings} />
        </aside>
      </div>
    </div>
  );
}
