import { useState } from "react";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { Breadcrumb } from "@/v2/shared/ui/Breadcrumb";
import { Panel, PanelHeader } from "@/v2/shared/ui/Panel";
import { TextField } from "@/v2/shared/ui/TextField";
import { TextArea } from "@/v2/shared/ui/TextArea";
import { Chip } from "@/v2/shared/ui/Chip";
import { DataTable } from "@/v2/shared/ui/DataTable";
import { KeyValueList } from "@/v2/shared/ui/KeyValueList";
import { Toast } from "@/v2/shared/ui/Toast";
import { EmptyState } from "@/v2/shared/ui/EmptyState";
import { v2ControlClasses } from "@/v2/shared/ui/shared";
import { v2Type } from "@/v2/theme/typography";
import { cn } from "@/lib/utils";
import { SettingsTabStrip } from "./shared/SettingsTabStrip";

export type Board24Value<T> =
  { kind: "available"; value: T } | { kind: "not-measured"; reason: string };

export type Board24Cadence = "off" | "weekly" | "biweekly" | "monthly";

export type Board24Competitor = {
  id: string;
  name: string;
  domain: string;
  tier: "core" | "discovered";
};

export type Board24AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
};

export type Board24BrandProfilePatch = Partial<{
  name: string;
  companyName: string;
  industry: string;
  website: string;
  description: string;
  targetAudience: string;
}>;

export type Board24AccountPatch = Partial<{
  firstName: string;
  lastName: string;
  timezone: string;
}>;

export type Board24Data = {
  brandId: string;
  mode: "guided" | "expert";
  brand: {
    name: string;
    companyName: string;
    industry: string;
    website: string;
    description: string;
    targetAudience: string;
  };
  cadence: Board24Cadence;
  engines: readonly string[];
  competitors: readonly Board24Competitor[];
  account: {
    email: string;
    firstName: string;
    lastName: string;
    timezone: string;
  };
  auditHistory: Board24Value<readonly Board24AuditEntry[]>;
  actions: {
    saveBrandProfile: (patch: Board24BrandProfilePatch) => Promise<void>;
    saveCadence: (cadence: Board24Cadence) => Promise<void>;
    addCompetitor: (input: { name: string; domain: string }) => Promise<void>;
    removeCompetitor: (id: string) => Promise<void>;
    saveAccountProfile: (patch: Board24AccountPatch) => Promise<void>;
  };
};

const CADENCE_LABEL: Record<Board24Cadence, string> = {
  off: "Off (manual only)",
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
};

function auditLabel(action: string): string {
  const words = action.split(".").join(" ").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function SaveState({ status }: { status: "idle" | "saving" | "saved" | "error"; error?: string }) {
  if (status === "saving") return <span className={v2Type.meta}>Saving…</span>;
  if (status === "saved")
    return <span className={cn(v2Type.meta, "text-[color:var(--v2-ok)]")}>Saved</span>;
  return null;
}

function BrandProfileCard({
  brand,
  onSave,
}: {
  brand: Board24Data["brand"];
  onSave: Board24Data["actions"]["saveBrandProfile"];
}) {
  const [form, setForm] = useState(brand);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string>("");

  const dirty =
    form.name !== brand.name ||
    form.companyName !== brand.companyName ||
    form.industry !== brand.industry ||
    form.website !== brand.website ||
    form.description !== brand.description ||
    form.targetAudience !== brand.targetAudience;

  const save = async () => {
    setStatus("saving");
    setError("");
    try {
      await onSave(form);
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not save the brand profile.");
    }
  };

  return (
    <Panel className="mb-5">
      <PanelHeader title="Brand profile" />
      <p className={cn(v2Type.meta, "mb-4")}>
        What VentureCite tells AI engines about your brand, and where it verifies claims against
        your own site.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Brand name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <TextField
          label="Company name"
          value={form.companyName}
          onChange={(e) => setForm({ ...form, companyName: e.target.value })}
        />
        <TextField
          label="Industry"
          value={form.industry}
          onChange={(e) => setForm({ ...form, industry: e.target.value })}
        />
        <TextField
          label="Website"
          value={form.website}
          onChange={(e) => setForm({ ...form, website: e.target.value })}
          placeholder="https://example.com"
        />
      </div>
      <div className="mt-4">
        <TextArea
          label="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
        />
      </div>
      <div className="mt-4">
        <TextField
          label="Target market / region"
          helper="Who you sell to and where - the audience VentureCite checks AI answers against."
          value={form.targetAudience}
          onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
          placeholder="e.g. Mid-market SaaS teams in the US and UK"
        />
      </div>
      {status === "error" ? (
        <p className="mt-3 text-[12.5px] text-[color:var(--v2-bad)]">{error}</p>
      ) : null}
      <div className="mt-5 flex items-center gap-3">
        <Button
          className="h-9 rounded-lg px-4 text-[13px] font-semibold"
          disabled={!dirty || status === "saving"}
          onClick={save}
          type="button"
        >
          Save brand profile
        </Button>
        <SaveState status={dirty ? "idle" : status} />
      </div>
    </Panel>
  );
}

function MeasurementCard({
  cadence,
  engines,
  competitors,
  onSaveCadence,
  onAddCompetitor,
  onRemoveCompetitor,
}: {
  cadence: Board24Cadence;
  engines: readonly string[];
  competitors: readonly Board24Competitor[];
  onSaveCadence: Board24Data["actions"]["saveCadence"];
  onAddCompetitor: Board24Data["actions"]["addCompetitor"];
  onRemoveCompetitor: Board24Data["actions"]["removeCompetitor"];
}) {
  const [selectedCadence, setSelectedCadence] = useState(cadence);
  const [cadenceStatus, setCadenceStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const saveCadence = async () => {
    setCadenceStatus("saving");
    try {
      await onSaveCadence(selectedCadence);
      setCadenceStatus("saved");
    } catch {
      setCadenceStatus("error");
    }
  };

  const addCompetitor = async () => {
    if (!name.trim() || !domain.trim()) {
      setAddError("Enter both a name and a domain.");
      return;
    }
    setAdding(true);
    setAddError("");
    try {
      await onAddCompetitor({ name: name.trim(), domain: domain.trim() });
      setName("");
      setDomain("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add the competitor.");
    } finally {
      setAdding(false);
    }
  };

  const removeCompetitor = async (id: string) => {
    setRemovingId(id);
    try {
      await onRemoveCompetitor(id);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Panel>
      <PanelHeader title="Measurement" />

      <div className="mb-6">
        <p className={cn(v2Type.label, "mb-2")}>AI engines VentureCite checks</p>
        <div className="flex flex-wrap gap-1.5">
          {engines.map((engine) => (
            <Chip key={engine} tone="outline">
              {engine}
            </Chip>
          ))}
        </div>
        <p className={cn(v2Type.meta, "mt-2")}>
          This is the full set of engines the citation runner queries today. It applies account-wide
          - per-brand engine selection is not available yet.
        </p>
      </div>

      <div className="mb-6">
        <p className={cn(v2Type.label, "mb-2")}>Observation cadence</p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className={cn(v2ControlClasses, "h-9 px-3 text-[13px]")}
            onChange={(e) => setSelectedCadence(e.target.value as Board24Cadence)}
            value={selectedCadence}
          >
            {(Object.keys(CADENCE_LABEL) as Board24Cadence[]).map((value) => (
              <option key={value} value={value}>
                {CADENCE_LABEL[value]}
              </option>
            ))}
          </select>
          <Button
            className="h-9 rounded-lg px-4 text-[13px] font-semibold"
            disabled={selectedCadence === cadence || cadenceStatus === "saving"}
            onClick={saveCadence}
            type="button"
          >
            Save cadence
          </Button>
          <SaveState status={selectedCadence === cadence ? cadenceStatus : "idle"} />
        </div>
      </div>

      <div>
        <p className={cn(v2Type.label, "mb-2")}>Competitor set</p>
        {competitors.length === 0 ? (
          <p className={cn(v2Type.meta, "mb-3")}>No competitors are tracked for this brand yet.</p>
        ) : (
          <DataTable
            className="mb-3"
            columns={[
              { key: "name", header: "Name" },
              { key: "domain", header: "Domain" },
              {
                key: "tier",
                header: "Set",
                render: (row) => (
                  <Chip tone={row.tier === "core" ? "brand" : "outline"}>{row.tier}</Chip>
                ),
              },
              {
                key: "id",
                header: "",
                align: "right",
                render: (row) => (
                  <button
                    className="text-[12.5px] font-semibold text-[color:var(--v2-ink3)] hover:text-[color:var(--v2-bad)]"
                    disabled={removingId === row.id}
                    onClick={() => removeCompetitor(row.id)}
                    type="button"
                  >
                    {removingId === row.id ? "Removing…" : "Remove"}
                  </button>
                ),
              },
            ]}
            rows={competitors}
            rowKey={(row) => row.id}
          />
        )}
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label="Name"
            onChange={(e) => setName(e.target.value)}
            placeholder="Competitor name"
            value={name}
          />
          <TextField
            label="Domain"
            onChange={(e) => setDomain(e.target.value)}
            placeholder="competitor.com"
            value={domain}
          />
          <Button
            className="h-9 rounded-lg px-4 text-[13px] font-semibold"
            disabled={adding}
            onClick={addCompetitor}
            type="button"
          >
            {adding ? "Adding…" : "Add competitor"}
          </Button>
        </div>
        {addError ? (
          <p className="mt-2 text-[12.5px] text-[color:var(--v2-bad)]">{addError}</p>
        ) : null}
      </div>
    </Panel>
  );
}

function AccountProfileCard({
  account,
  onSave,
}: {
  account: Board24Data["account"];
  onSave: Board24Data["actions"]["saveAccountProfile"];
}) {
  const [firstName, setFirstName] = useState(account.firstName);
  const [lastName, setLastName] = useState(account.lastName);
  const [timezone, setTimezone] = useState(account.timezone);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const dirty =
    firstName !== account.firstName ||
    lastName !== account.lastName ||
    timezone !== account.timezone;

  const save = async () => {
    setStatus("saving");
    try {
      await onSave({ firstName, lastName, timezone });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  return (
    <Panel className="mb-5">
      <PanelHeader title="Account profile" />
      <p className={cn(v2Type.meta, "mb-3")}>
        Signed in as <span className="font-medium text-[color:var(--v2-ink)]">{account.email}</span>
      </p>
      <div className="space-y-3">
        <TextField
          label="First name"
          onChange={(e) => setFirstName(e.target.value)}
          value={firstName}
        />
        <TextField
          label="Last name"
          onChange={(e) => setLastName(e.target.value)}
          value={lastName}
        />
        <TextField
          label="Timezone"
          onChange={(e) => setTimezone(e.target.value)}
          value={timezone}
        />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button
          className="h-9 rounded-lg px-4 text-[13px] font-semibold"
          disabled={!dirty || status === "saving"}
          onClick={save}
          type="button"
        >
          Save
        </Button>
        <SaveState status={dirty ? "idle" : status} />
      </div>
    </Panel>
  );
}

function AuditHistoryCard({ history }: { history: Board24Data["auditHistory"] }) {
  return (
    <Panel>
      <PanelHeader title="Audit history" />
      {history.kind === "not-measured" ? (
        <EmptyState description={history.reason} title="No audit history yet" />
      ) : history.value.length === 0 ? (
        <EmptyState
          description="Actions you take in Settings will appear here."
          title="No audit history yet"
        />
      ) : (
        <KeyValueList
          items={history.value.map((entry) => ({
            label: new Date(entry.createdAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }),
            value: auditLabel(entry.action),
            detail: entry.entityType,
          }))}
        />
      )}
    </Panel>
  );
}

export function Board24Screen({ data, staleAsOf }: V2ScreenProps<Board24Data>) {
  return (
    <div className="min-w-0 flex-1 px-8 py-6" data-testid="v2-board-24">
      <Breadcrumb className="mb-3" items={[{ label: "Settings", current: true }]} />
      <PageHeader
        sub="Configure how VentureCite measures your brand and what we can verify."
        title="Settings"
      />
      <SettingsTabStrip className="mb-6 mt-5" />

      {staleAsOf ? (
        <Toast
          className="mb-5"
          message={`Refreshing - last loaded ${new Date(staleAsOf).toLocaleString()}.`}
          tone="warn"
          title="Showing recent data"
        />
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_322px]">
        <main className="min-w-0">
          <BrandProfileCard brand={data.brand} onSave={data.actions.saveBrandProfile} />
          <MeasurementCard
            cadence={data.cadence}
            competitors={data.competitors}
            engines={data.engines}
            onAddCompetitor={data.actions.addCompetitor}
            onRemoveCompetitor={data.actions.removeCompetitor}
            onSaveCadence={data.actions.saveCadence}
          />
        </main>
        <aside className="min-w-0">
          <AccountProfileCard account={data.account} onSave={data.actions.saveAccountProfile} />
          <AuditHistoryCard history={data.auditHistory} />
        </aside>
      </div>
    </div>
  );
}
