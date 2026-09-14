import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { Avatar } from "@/v2/shared/ui/Avatar";
import { Chip } from "@/v2/shared/ui/Chip";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { FilterSelect } from "@/v2/shared/ui/FilterSelect";
import { Meter } from "@/v2/shared/ui/Meter";
import { Panel, PanelHeader } from "@/v2/shared/ui/Panel";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { TextArea } from "@/v2/shared/ui/TextArea";
import { TextField } from "@/v2/shared/ui/TextField";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { SettingsNav } from "./shared/SettingsNav";

export type Board42Role = "editor" | "analyst" | "viewer";
export type Board42InvitationStatus = "pending" | "revoked" | "accepted";

export type Board42Member = {
  id: string;
  name: string;
  email: string | null;
  assignedBrandCount: number;
  activeTaskCount: number;
  waitingConfirmationCount: number;
  lastActivityAt: string | null;
};

export type Board42Invitation = {
  id: string;
  email: string;
  role: Board42Role;
  status: Board42InvitationStatus;
  createdAt: string;
};

export type Board42AuditEvent = {
  id: string;
  summary: string;
  occurredAt: string;
};

export type Board42TaskOption = { id: string; title: string };

export type Board42HandoffInput = {
  taskId: string;
  toEmail: string | null;
  note: string;
  dueDate: string | null;
};

export type Board42Data = {
  brandId: string;
  mode: "guided" | "expert";
  brandName: string;
  member: Board42Member;
  seatUsage: { used: number; limit: number | null };
  invitations: Board42Invitation[];
  auditEvents: Board42AuditEvent[];
  tasks: Board42TaskOption[];
  actions?: {
    onInvite?: (input: { email: string; role: Board42Role }) => void;
    isInvitePending?: boolean;
    inviteError?: string | null;
    onRevoke?: (invitationId: string) => void;
    isRevokePending?: boolean;
    onResend?: (invitationId: string) => void;
    isResendPending?: boolean;
    onSubmitHandoff?: (input: Board42HandoffInput) => void;
    isHandoffPending?: boolean;
    handoffError?: string | null;
  };
};

const ROLE_OPTIONS: readonly { value: Board42Role; label: string }[] = [
  { value: "editor", label: "Editor" },
  { value: "analyst", label: "Analyst" },
  { value: "viewer", label: "Viewer" },
];

const ROLE_TONE: Record<"owner" | Board42Role, "brand" | "neutral" | "ok" | "warn"> = {
  owner: "brand",
  editor: "warn",
  analyst: "ok",
  viewer: "neutral",
};

function initials(nameOrEmail: string): string {
  const trimmed = nameOrEmail.trim();
  if (!trimmed) return "?";
  const atIndex = trimmed.indexOf("@");
  const base = atIndex > 0 ? trimmed.slice(0, atIndex) : trimmed;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return base.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function shortDateTime(iso: string | null): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return `${shortDate(iso)}, ${parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function MembersPanel({ member }: { member: Board42Member }) {
  const columns: readonly DataColumn<Board42Member>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <span className="flex items-center gap-2.5">
          <Avatar initials={initials(row.name)} label={row.name} size="sm" />
          <span>
            <span className="block font-semibold text-[color:var(--v2-ink)]">{row.name}</span>
            <span className="block text-[12.5px] text-[color:var(--v2-ink3)]">{row.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: "id",
      header: "Role",
      wrap: false,
      render: () => <Chip tone={ROLE_TONE.owner}>Owner</Chip>,
    },
    {
      key: "assignedBrandCount",
      header: "Assigned brands",
      numeric: true,
      wrap: false,
    },
    { key: "activeTaskCount", header: "Active tasks", numeric: true, wrap: false },
    {
      key: "waitingConfirmationCount",
      header: "Waiting confirmations",
      numeric: true,
      wrap: false,
    },
    {
      key: "lastActivityAt",
      header: "Last activity",
      wrap: false,
      render: (row) =>
        row.lastActivityAt ? (
          shortDateTime(row.lastActivityAt)
        ) : (
          <StateLabel state="not-measured" />
        ),
    },
  ];

  return (
    <Panel className="mb-5" padding="none">
      <div className="px-5 pt-[18px]">
        <PanelHeader title="Team members (1)" />
      </div>
      <DataTable columns={columns} rowKey={(row) => row.id} rows={[member]} />
    </Panel>
  );
}

function InviteForm({
  onSubmit,
  pending,
  error,
}: {
  onSubmit?: (input: { email: string; role: Board42Role }) => void;
  pending?: boolean;
  error?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Board42Role>("viewer");

  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3 rounded-[var(--v2-radius)] border border-[var(--v2-line)] bg-[var(--v2-inset)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!email.trim()) return;
        onSubmit?.({ email: email.trim(), role });
      }}
    >
      <TextField
        className="max-w-xs"
        id="invite-email"
        label="Email address"
        onChange={(event) => setEmail(event.target.value)}
        placeholder="teammate@example.com"
        type="email"
        value={email}
      />
      <div>
        <p className="mb-1.5 block text-[12px] leading-[1.35] font-semibold text-[color:var(--v2-ink2)]">
          Role
        </p>
        <FilterSelect
          label="Role"
          onValueChange={(value) => setRole(value as Board42Role)}
          options={ROLE_OPTIONS}
          value={role}
        />
      </div>
      <Button disabled={pending || !email.trim()} type="submit">
        {pending ? "Sending…" : "Send invite"}
      </Button>
      {error ? <p className="w-full text-[12.5px] text-[color:var(--v2-bad)]">{error}</p> : null}
    </form>
  );
}

function TaskHandoffPanel({ data }: { data: Board42Data }) {
  const { tasks, member, invitations, actions } = data;
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  const [toEmail, setToEmail] = useState("");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState("");

  const pendingInvitees = invitations.filter((invite) => invite.status === "pending");
  const selectedTask = tasks.find((task) => task.id === taskId) ?? null;

  return (
    <Panel id="task-handoff" padding="spacious">
      <PanelHeader title="Task handoff" />
      {tasks.length === 0 ? (
        <p className={v2Type.body}>
          There is no work yet for {data.brandName}. Handoffs appear here once a task exists.
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!taskId) return;
            actions?.onSubmitHandoff?.({
              taskId,
              toEmail: toEmail || null,
              note,
              dueDate: dueDate || null,
            });
          }}
        >
          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-[color:var(--v2-ink2)]">Task</p>
            <FilterSelect
              className="max-w-md"
              label="Task"
              onValueChange={setTaskId}
              options={tasks.map((task) => ({ value: task.id, label: task.title }))}
              value={taskId}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="min-w-[200px] flex-1">
              <p className="mb-1.5 text-[12px] font-semibold text-[color:var(--v2-ink2)]">
                Current owner
              </p>
              <div className="flex items-center gap-2 rounded-[var(--v2-radius)] border border-[var(--v2-line)] bg-[var(--v2-paper)] px-3 py-2">
                <Avatar initials={initials(member.name)} size="sm" />
                <span className="text-[13px] font-medium">{member.name}</span>
              </div>
            </div>
            <div className="min-w-[200px] flex-1">
              <p className="mb-1.5 text-[12px] font-semibold text-[color:var(--v2-ink2)]">
                New owner
              </p>
              {pendingInvitees.length > 0 ? (
                <FilterSelect
                  label="New owner"
                  onValueChange={setToEmail}
                  options={pendingInvitees.map((invite) => ({
                    value: invite.email,
                    label: invite.email,
                  }))}
                  placeholder="Choose an invited teammate"
                  value={toEmail}
                />
              ) : (
                <p className="rounded-[var(--v2-radius)] border border-dashed border-[var(--v2-line2)] px-3 py-2 text-[12.5px] text-[color:var(--v2-ink3)]">
                  Invite a teammate first - there is no one else to hand this off to yet.
                </p>
              )}
            </div>
          </div>
          <div className="max-w-xs">
            <TextField
              id="handoff-due-date"
              label="Due date"
              onChange={(event) => setDueDate(event.target.value)}
              type="date"
              value={dueDate}
            />
          </div>
          <TextArea
            helper={`${note.length} / 500`}
            id="handoff-note"
            label="Handoff note"
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add context for whoever picks this up…"
            value={note}
          />
          {actions?.handoffError ? (
            <p className="text-[12.5px] text-[color:var(--v2-bad)]">{actions.handoffError}</p>
          ) : null}
          <div className="flex items-center gap-4">
            <Button disabled={actions?.isHandoffPending || !taskId} type="submit">
              {actions?.isHandoffPending ? "Recording…" : "Reassign task"}
            </Button>
            <button
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[color:var(--v2-brand)] hover:underline"
              onClick={() => {
                if (!selectedTask) return;
                const url = `${window.location.origin}/v2/my-work/tasks/${selectedTask.id}?brandId=${data.brandId}&mode=${data.mode}`;
                void navigator.clipboard?.writeText(url);
              }}
              type="button"
            >
              <V2Icon name="link" size={14} />
              Copy evidence link
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}

function RightRail({ data }: { data: Board42Data }) {
  const { seatUsage, invitations, auditEvents, actions } = data;
  const pending = invitations.filter((invite) => invite.status === "pending");
  const percent =
    seatUsage.limit && seatUsage.limit > 0
      ? Math.min(100, (seatUsage.used / seatUsage.limit) * 100)
      : null;

  return (
    <div className="min-w-0 space-y-5">
      <section>
        <h3 className={v2Type.sectionTitle}>Seat usage</h3>
        <p className={`${v2Type.body} mt-2`}>
          {seatUsage.limit !== null
            ? `${seatUsage.used} of ${seatUsage.limit} seats used`
            : `${seatUsage.used} seat used`}
        </p>
        {percent !== null ? (
          <Meter className="mt-2" value={percent} />
        ) : (
          <p className={`${v2Type.meta} mt-2`}>This account has no seat cap configured.</p>
        )}
      </section>

      <section className="border-t border-[var(--v2-line)] pt-5">
        <h3 className={v2Type.sectionTitle}>Role permissions</h3>
        <div className="mt-3 space-y-3">
          {(
            [
              {
                role: "owner" as const,
                label: "Owner",
                perms: [
                  "Manage team and settings",
                  "Invite members",
                  "Reassign any task",
                  "Access all evidence",
                ],
              },
              {
                role: "editor" as const,
                label: "Editor",
                perms: [
                  "Create and edit work",
                  "Reassign own tasks",
                  "Attach and manage evidence",
                  "View reports",
                ],
              },
              {
                role: "analyst" as const,
                label: "Analyst",
                perms: [
                  "Work on assigned tasks",
                  "Add evidence",
                  "Request confirmations",
                  "View brand data",
                ],
              },
              {
                role: "viewer" as const,
                label: "Viewer",
                perms: [
                  "View work and results",
                  "Comment on tasks",
                  "No editing or reassigning",
                  "Limited evidence access",
                ],
              },
            ] as const
          ).map((row) => (
            <div className="flex items-start gap-3" key={row.role}>
              <Chip className="w-[62px] shrink-0 justify-center" tone={ROLE_TONE[row.role]}>
                {row.label}
              </Chip>
              <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] leading-[1.4] text-[color:var(--v2-ink2)]">
                {row.perms.map((perm) => (
                  <li key={perm}>{perm}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--v2-line)] pt-5">
        <h3 className={v2Type.sectionTitle}>Pending invitations ({pending.length})</h3>
        {pending.length === 0 ? (
          <p className={`${v2Type.body} mt-2`}>No invitations are pending.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((invite) => (
              <li className="flex items-start gap-2.5" key={invite.id}>
                <Avatar initials={initials(invite.email)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-[color:var(--v2-ink)]">
                    {invite.email}
                  </p>
                  <p className="text-[12px] text-[color:var(--v2-ink3)]">
                    Invited {shortDate(invite.createdAt)}
                  </p>
                  <div className="mt-1 flex gap-3">
                    <button
                      className="text-[12px] font-semibold text-[color:var(--v2-brand)] hover:underline disabled:opacity-50"
                      disabled={actions?.isResendPending}
                      onClick={() => actions?.onResend?.(invite.id)}
                      type="button"
                    >
                      Resend
                    </button>
                    <button
                      className="text-[12px] font-semibold text-[color:var(--v2-bad)] hover:underline disabled:opacity-50"
                      disabled={actions?.isRevokePending}
                      onClick={() => actions?.onRevoke?.(invite.id)}
                      type="button"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
                <Chip tone={ROLE_TONE[invite.role]}>{invite.role}</Chip>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-[var(--v2-line)] pt-5">
        <h3 className={v2Type.sectionTitle}>Recent audit history</h3>
        {auditEvents.length === 0 ? (
          <p className={`${v2Type.body} mt-2`}>No team activity has been recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {auditEvents.map((event) => (
              <li
                className="border-t border-[var(--v2-line)] pt-3 first:border-t-0 first:pt-0"
                key={event.id}
              >
                <p className="text-[12.5px] text-[color:var(--v2-ink)]">{event.summary}</p>
                <p className="mt-0.5 text-[11.5px] text-[color:var(--v2-ink3)]">
                  {shortDateTime(event.occurredAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function Board42Screen({ data }: V2ScreenProps<Board42Data>) {
  const [showInvite, setShowInvite] = useState(false);

  return (
    <div
      className="min-h-full text-[14px] leading-[1.5] text-[color:var(--v2-ink)]"
      data-testid="board42-screen"
    >
      <TwoColumn
        className="min-h-full gap-0"
        main={
          <div className="min-w-0 px-6 py-7">
            <SettingsNav active="team" brandId={data.brandId} mode={data.mode} />
            <PageHeader
              actions={
                <>
                  <Button onClick={() => setShowInvite((open) => !open)} variant="outline">
                    Invite member
                  </Button>
                  <Button
                    onClick={() =>
                      document
                        .getElementById("task-handoff")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    variant="outline"
                  >
                    Reassign task
                  </Button>
                </>
              }
              sub="Keep your team aligned, move work forward, and maintain a clear audit trail."
              title="Assign work without losing evidence"
            />
            {showInvite ? (
              <InviteForm
                error={data.actions?.inviteError}
                onSubmit={(input) => {
                  data.actions?.onInvite?.(input);
                  setShowInvite(false);
                }}
                pending={data.actions?.isInvitePending}
              />
            ) : null}
            <div className="mt-6">
              <MembersPanel member={data.member} />
              <TaskHandoffPanel data={data} />
            </div>
          </div>
        }
        rightRail={
          <div className="border-t border-[var(--v2-line)] px-7 py-7 md:border-t-0 md:border-l">
            <RightRail data={data} />
          </div>
        }
        rightRailWidth={322}
      />
    </div>
  );
}
