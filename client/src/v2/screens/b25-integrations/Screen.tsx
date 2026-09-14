import { useState } from "react";
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { Breadcrumb } from "@/v2/shared/ui/Breadcrumb";
import { Panel, PanelHeader } from "@/v2/shared/ui/Panel";
import { TextField } from "@/v2/shared/ui/TextField";
import { StatusDot } from "@/v2/shared/ui/StatusDot";
import { EmptyState } from "@/v2/shared/ui/EmptyState";
import { InlineAlert } from "@/v2/shared/ui/InlineAlert";
import { Toast } from "@/v2/shared/ui/Toast";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { cn } from "@/lib/utils";
import { SettingsTabStrip } from "../b24-settings/shared/SettingsTabStrip";

export type Board25NoBackendProvider = {
  id: string;
  name: string;
  category: "Visibility evidence" | "Business outcomes";
  reads: string;
  verifies: string;
};

export type Board25ActivityEntry = {
  id: string;
  message: string;
  detail: string;
  at: string;
};

export type Board25Data = {
  brandId: string;
  mode: "guided" | "expert";
  noBackendProviders: readonly Board25NoBackendProvider[];
  requestedProviders: readonly string[];
  slack: { connected: boolean; lastTriggered: string | null };
  buffer: { connected: boolean };
  recentActivity: readonly Board25ActivityEntry[];
  actions: {
    connectSlack: (webhookUrl: string) => Promise<void>;
    disconnectSlack: () => Promise<void>;
    testSlack: () => Promise<void>;
    connectBuffer: (accessToken: string) => Promise<void>;
    disconnectBuffer: () => Promise<void>;
    requestAccess: (providerId: string) => Promise<void>;
  };
};

function ProviderRow({
  provider,
  requested,
  onRequestAccess,
}: {
  provider: Board25NoBackendProvider;
  requested: boolean;
  onRequestAccess: (providerId: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(requested);

  const request = async () => {
    setPending(true);
    try {
      await onRequestAccess(provider.id);
      setSent(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--v2-line)] py-3 last:border-0 last:pb-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold text-[color:var(--v2-ink)]">
            {provider.name}
          </span>
          <StatusDot label="Not connected" tone="neutral" />
        </div>
        <p className={cn(v2Type.meta, "mt-0.5")}>Reads: {provider.reads}</p>
        <p className={v2Type.meta}>Verifies: {provider.verifies}</p>
      </div>
      <Button
        className="h-8 rounded-lg px-3 text-[12.5px] font-semibold"
        disabled={pending || sent}
        onClick={request}
        type="button"
        variant="outline"
      >
        {sent ? "Requested" : pending ? "Requesting…" : "Request access"}
      </Button>
    </div>
  );
}

function ProviderCategory({
  title,
  description,
  providers,
  requestedProviders,
  onRequestAccess,
}: {
  title: string;
  description: string;
  providers: readonly Board25NoBackendProvider[];
  requestedProviders: readonly string[];
  onRequestAccess: (providerId: string) => Promise<void>;
}) {
  return (
    <Panel className="mb-5">
      <PanelHeader title={title} />
      <p className={cn(v2Type.meta, "mb-3")}>{description}</p>
      {providers.map((provider) => (
        <ProviderRow
          key={provider.id}
          onRequestAccess={onRequestAccess}
          provider={provider}
          requested={requestedProviders.includes(provider.id)}
        />
      ))}
    </Panel>
  );
}

function SlackCard({
  slack,
  onConnect,
  onDisconnect,
  onTest,
}: {
  slack: Board25Data["slack"];
  onConnect: Board25Data["actions"]["connectSlack"];
  onDisconnect: Board25Data["actions"]["disconnectSlack"];
  onTest: Board25Data["actions"]["testSlack"];
}) {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [busy, setBusy] = useState<"connect" | "disconnect" | "test" | null>(null);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<"ok" | "failed" | null>(null);

  const connect = async () => {
    setBusy("connect");
    setError("");
    try {
      await onConnect(webhookUrl.trim());
      setWebhookUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Slack.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await onDisconnect();
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    setTestResult(null);
    try {
      await onTest();
      setTestResult("ok");
    } catch {
      setTestResult("failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel className="mb-5">
      <PanelHeader title="Notifications" />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <V2Icon className="text-[color:var(--v2-ink3)]" name="slack" size={16} />
            <span className="text-[13.5px] font-semibold text-[color:var(--v2-ink)]">Slack</span>
            <StatusDot
              label={slack.connected ? "Connected" : "Not connected"}
              tone={slack.connected ? "ok" : "neutral"}
            />
          </div>
          <p className={cn(v2Type.meta, "mt-0.5")}>
            Reads: channel webhook target. Verifies: delivery of measurement alerts.
          </p>
          {slack.connected ? (
            <p className={cn(v2Type.meta, "mt-0.5")}>
              {slack.lastTriggered
                ? `Last test sent ${new Date(slack.lastTriggered).toLocaleString()}`
                : "No test message sent yet."}
            </p>
          ) : null}
        </div>
        {slack.connected ? (
          <div className="flex shrink-0 gap-2">
            <Button
              className="h-8 rounded-lg px-3 text-[12.5px] font-semibold"
              disabled={busy !== null}
              onClick={test}
              type="button"
              variant="outline"
            >
              {busy === "test" ? "Sending…" : "Send test"}
            </Button>
            <Button
              className="h-8 rounded-lg px-3 text-[12.5px] font-semibold text-[color:var(--v2-bad)]"
              disabled={busy !== null}
              onClick={disconnect}
              type="button"
              variant="outline"
            >
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        ) : null}
      </div>

      {testResult === "ok" ? (
        <Toast className="mt-3" message="Slack accepted the test message." tone="ok" />
      ) : null}
      {testResult === "failed" ? (
        <Toast
          className="mt-3"
          message="Slack rejected the test message. Reconnect the webhook."
          tone="bad"
        />
      ) : null}

      {!slack.connected ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <TextField
            className="min-w-[320px] flex-1"
            helper="From Slack: Incoming Webhooks → Add New Webhook to Workspace."
            label="Slack webhook URL"
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/…"
            value={webhookUrl}
          />
          <Button
            className="h-9 rounded-lg px-4 text-[13px] font-semibold"
            disabled={busy !== null || webhookUrl.trim().length === 0}
            onClick={connect}
            type="button"
          >
            {busy === "connect" ? "Connecting…" : "Connect"}
          </Button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-[12.5px] text-[color:var(--v2-bad)]">{error}</p> : null}
    </Panel>
  );
}

function BufferCard({
  buffer,
  onConnect,
  onDisconnect,
}: {
  buffer: Board25Data["buffer"];
  onConnect: Board25Data["actions"]["connectBuffer"];
  onDisconnect: Board25Data["actions"]["disconnectBuffer"];
}) {
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null);
  const [error, setError] = useState("");

  const connect = async () => {
    setBusy("connect");
    setError("");
    try {
      await onConnect(accessToken.trim());
      setAccessToken("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Buffer.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await onDisconnect();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel className="mb-5">
      <PanelHeader title="Social publishing" />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold text-[color:var(--v2-ink)]">Buffer</span>
            <StatusDot
              label={buffer.connected ? "Connected" : "Not connected"}
              tone={buffer.connected ? "ok" : "neutral"}
            />
          </div>
          <p className={cn(v2Type.meta, "mt-0.5")}>
            Reads: your Buffer channels. Verifies: content distributed through VentureCite.
          </p>
        </div>
        {buffer.connected ? (
          <Button
            className="h-8 shrink-0 rounded-lg px-3 text-[12.5px] font-semibold text-[color:var(--v2-bad)]"
            disabled={busy !== null}
            onClick={disconnect}
            type="button"
            variant="outline"
          >
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
          </Button>
        ) : null}
      </div>
      {!buffer.connected ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <TextField
            className="min-w-[320px] flex-1"
            helper="From Buffer: Settings → API → Generate access token."
            label="Buffer access token"
            onChange={(e) => setAccessToken(e.target.value)}
            type="password"
            value={accessToken}
          />
          <Button
            className="h-9 rounded-lg px-4 text-[13px] font-semibold"
            disabled={busy !== null || accessToken.trim().length === 0}
            onClick={connect}
            type="button"
          >
            {busy === "connect" ? "Connecting…" : "Connect"}
          </Button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-[12.5px] text-[color:var(--v2-bad)]">{error}</p> : null}
    </Panel>
  );
}

export function Board25Screen({ data, staleAsOf }: V2ScreenProps<Board25Data>) {
  const visibilityProviders = data.noBackendProviders.filter(
    (provider) => provider.category === "Visibility evidence",
  );
  const outcomeProviders = data.noBackendProviders.filter(
    (provider) => provider.category === "Business outcomes",
  );

  return (
    <div className="min-w-0 flex-1 px-8 py-6" data-testid="v2-board-25">
      <Breadcrumb
        className="mb-3"
        items={[
          { href: "/v2/settings", label: "Settings" },
          { current: true, label: "Integrations" },
        ]}
      />
      <PageHeader
        sub="Link your data sources so VentureCite can verify what's true and show the impact on your business."
        title="Connect evidence and business outcomes"
      />
      <SettingsTabStrip className="mb-6 mt-5" />

      {staleAsOf ? (
        <Toast
          className="mb-5"
          message={`Refreshing - last loaded ${new Date(staleAsOf).toLocaleString()}.`}
          title="Showing recent data"
          tone="warn"
        />
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_322px]">
        <main className="min-w-0">
          <ProviderCategory
            description="Connect channels that show how often and where you appear."
            onRequestAccess={data.actions.requestAccess}
            providers={visibilityProviders}
            requestedProviders={data.requestedProviders}
            title="Visibility evidence"
          />
          <ProviderCategory
            description="Connect the systems that show how visibility drives real results."
            onRequestAccess={data.actions.requestAccess}
            providers={outcomeProviders}
            requestedProviders={data.requestedProviders}
            title="Business outcomes"
          />
          <BufferCard
            buffer={data.buffer}
            onConnect={data.actions.connectBuffer}
            onDisconnect={data.actions.disconnectBuffer}
          />
          <SlackCard
            onConnect={data.actions.connectSlack}
            onDisconnect={data.actions.disconnectSlack}
            onTest={data.actions.testSlack}
            slack={data.slack}
          />
        </main>

        <aside className="min-w-0">
          <Panel className="mb-5">
            <PanelHeader title="Data access rules" />
            <div className="space-y-3">
              <InlineAlert tone="neutral">
                <span className="font-semibold">Read only.</span> We only read the data you grant
                access to.
              </InlineAlert>
              <InlineAlert tone="neutral">
                <span className="font-semibold">Verify, don&apos;t store.</span> We use data to
                verify claims and show insights.
              </InlineAlert>
              <InlineAlert tone="neutral">
                <span className="font-semibold">Your control.</span> You can manage or disconnect
                integrations at any time.
              </InlineAlert>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Recent activity" />
            {data.recentActivity.length === 0 ? (
              <EmptyState
                description="Connect an integration or send a test message to see activity here."
                title="No activity yet"
              />
            ) : (
              <ul className="space-y-3">
                {data.recentActivity.map((entry) => (
                  <li key={entry.id}>
                    <p className="text-[13px] font-medium text-[color:var(--v2-ink)]">
                      {entry.message}
                    </p>
                    <p className={v2Type.meta}>
                      {entry.detail} · {new Date(entry.at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
