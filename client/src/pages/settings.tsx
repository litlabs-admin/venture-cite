// Account settings page (Wave 2.2/2.3).
//
// Today this hosts only the GDPR-self-service blocks: account deletion
// + data export. Future settings (notifications, integrations, billing)
// can grow here as their own sections.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { getAccessToken } from "@/lib/authStore";
import BufferConnectDialog from "@/components/articles/BufferConnectDialog";
import PageHeader from "@/components/PageHeader";
import { pageExplainers } from "@/lib/pageExplainers";
import { Loader2 } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { useTourState, useTourStatePatch } from "@/hooks/useTourState";

type NotificationPreference = {
  type: string;
  label: string;
  description: string;
  channel: "email";
  emailEnabled: boolean;
};

// Extract a clean error message from an ApiError or generic Error.
// apiRequest throws ApiError on non-2xx, with message format
// "<status>: <server-error-or-text>". We prefer the parsed JSON `error`
// field when present; otherwise we strip the leading "<status>: " prefix.
function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { error?: string } | null | undefined;
    if (body && typeof body === "object" && typeof body.error === "string") {
      return body.error;
    }
    return err.message.replace(/^\d+:\s*/, "") || fallback;
  }
  if (err instanceof Error) return err.message.replace(/^\d+:\s*/, "") || fallback;
  return fallback;
}

// Profile — first name, last name, timezone. Initial values come from the
// /api/auth/me query already populated by useAuth(); timezone is not in
// that response today, so we fall back to the browser-resolved IANA zone.
function ProfileSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const browserTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [timezone, setTimezone] = useState("");

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setTimezone(user.timezone ?? browserTz);
    }
  }, [user, browserTz]);

  const timezones = useMemo<string[]>(() => {
    try {
      const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
        .supportedValuesOf;
      return fn ? fn("timeZone") : [];
    } catch {
      return [];
    }
  }, []);

  const updateProfile = useMutation({
    mutationFn: async (body: { firstName?: string; lastName?: string; timezone?: string }) => {
      const res = await apiRequest("PATCH", "/api/user/profile", body);
      return (await res.json()) as { success: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ description: "Profile updated" });
    },
    onError: (err: unknown) =>
      toast({
        description: getApiErrorMessage(err, "Failed to update profile"),
        variant: "destructive",
      }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Signed in as{" "}
          <span className="font-medium text-foreground">{user?.email ?? "(no email)"}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={100}
              data-testid="input-first-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={100}
              data-testid="input-last-name"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="timezone" data-testid="select-timezone">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {timezones.length > 0 ? (
                timezones.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value={timezone || "UTC"}>{timezone || "UTC"}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => updateProfile.mutate({ firstName, lastName, timezone })}
          disabled={updateProfile.isPending}
          data-testid="button-save-profile"
        >
          {updateProfile.isPending ? "Saving…" : "Save profile"}
        </Button>
      </CardContent>
    </Card>
  );
}

// Password change — re-authenticates by requiring the current password.
function PasswordSection() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePassword = useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/user/password", body);
      return (await res.json()) as { success: boolean };
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ description: "Password changed" });
    },
    onError: (err: unknown) =>
      toast({
        description: getApiErrorMessage(err, "Failed to change password"),
        variant: "destructive",
      }),
  });

  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    passwordsMatch &&
    !changePassword.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>Minimum 8 characters.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            data-testid="input-current-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            data-testid="input-new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            data-testid="input-confirm-password"
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-sm text-destructive">Passwords don&apos;t match.</p>
          )}
        </div>
        <Button
          onClick={() => changePassword.mutate({ currentPassword, newPassword })}
          disabled={!canSubmit}
          data-testid="button-change-password"
        >
          {changePassword.isPending ? "Changing…" : "Change password"}
        </Button>
      </CardContent>
    </Card>
  );
}

// Billing — bounces the user to a Stripe customer portal session.
function BillingSection() {
  const { toast } = useToast();
  const { user } = useAuth();
  const plan = user?.accessTier ?? "free";
  const openPortal = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/portal-session");
      const json = (await res.json()) as { url?: string };
      if (!json.url) throw new Error("Failed to open billing portal");
      return json as { url: string };
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err: unknown) =>
      toast({
        description: getApiErrorMessage(err, "Failed to open billing portal"),
        variant: "destructive",
      }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>
          Manage subscription, payment method, and invoices through Stripe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground" data-testid="text-billing-plan">
          Current plan: <span className="font-medium text-foreground">{plan}</span>
        </p>
        <Button
          onClick={() => openPortal.mutate()}
          disabled={openPortal.isPending}
          data-testid="button-manage-billing"
        >
          {openPortal.isPending ? "Opening…" : "Manage billing"}
        </Button>
      </CardContent>
    </Card>
  );
}

// Integrations — uses /api/buffer/status as the connection-status probe.
// That endpoint is a cheap DB lookup (no fan-out to Buffer's GraphQL API),
// so it's safe to call on every Settings mount. Uses a raw fetch so a 5xx
// doesn't push the query into an error state — we just render "Not
// connected" and let the user retry via the Connect dialog.
function IntegrationsSection() {
  const { data: buffer } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/buffer/status"],
    queryFn: async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/buffer/status", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return { connected: false };
        const json = (await res.json()) as { connected?: boolean };
        return { connected: Boolean(json.connected) };
      } catch {
        return { connected: false };
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const connected = !!buffer?.connected;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <p className="font-medium text-foreground">Buffer</p>
            <p className="text-sm text-muted-foreground">
              {connected ? "Connected" : "Not connected"}
            </p>
          </div>
          <BufferConnectDialog connected={connected} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const { state: tourState } = useTourState();
  const { mutate: patchTour } = useTourStatePatch();
  const wildcardSuppressed = (tourState.perUserSuppressed ?? []).includes("*");

  const toggleWildcard = (next: boolean) => {
    patchTour({ op: next ? "suppress" : "unsuppress", tourId: "*" });
  };

  const prefsQueryKey = ["/api/user/notification-preferences"];
  const {
    data: prefsData,
    isLoading: prefsLoading,
    isError: prefsIsError,
    isRefetching: prefsIsRefetching,
    refetch: refetchPrefs,
  } = useQuery<{
    success: boolean;
    data: NotificationPreference[];
  }>({
    queryKey: prefsQueryKey,
  });
  const preferences = prefsData?.data ?? [];

  const prefMutation = useMutation({
    mutationFn: async (input: { type: string; emailEnabled: boolean }) => {
      const res = await apiRequest("PATCH", "/api/user/notification-preferences", input);
      return (await res.json()) as { success: boolean; error?: string };
    },
    onMutate: async ({ type, emailEnabled }) => {
      // Optimistic: flip the toggle immediately so the UI feels snappy.
      await queryClient.cancelQueries({ queryKey: prefsQueryKey });
      const prev = queryClient.getQueryData<{ success: boolean; data: NotificationPreference[] }>(
        prefsQueryKey,
      );
      if (prev) {
        queryClient.setQueryData(prefsQueryKey, {
          ...prev,
          data: prev.data.map((p) => (p.type === type ? { ...p, emailEnabled } : p)),
        });
      }
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(prefsQueryKey, ctx.prev);
      toast({
        title: "Could not update preference",
        description: "Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: prefsQueryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/user/delete", { password, confirm });
      return (await res.json()) as { success: boolean; message?: string; error?: string };
    },
    onSuccess: (data) => {
      if (!data.success) {
        toast({
          title: "Could not delete account",
          description: data.error ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Account deletion scheduled",
        description: data.message ?? "You'll be signed out now.",
      });
      // Sign out — the auth middleware will refuse the user from here on.
      setTimeout(() => logout(), 1500);
    },
    onError: (err: unknown) => {
      toast({
        title: "Could not delete account",
        description: getApiErrorMessage(err, "Unexpected error."),
        variant: "destructive",
      });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not signed in.");
      const res = await fetch("/api/user/export", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 429) {
        // Trust the server's message so client + server stay in sync.
        try {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? "Already exported recently. Try again later.");
        } catch (err) {
          if (err instanceof Error) throw err;
          throw new Error("Already exported recently. Try again later.");
        }
      }
      if (!res.ok) {
        throw new Error(`Export failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `venturecite-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (err: unknown) => {
      toast({
        title: "Export failed",
        description: getApiErrorMessage(err, "Unexpected error."),
        variant: "destructive",
      });
    },
  });

  const canSubmit = password.length > 0 && confirm === "DELETE" && !deleteMutation.isPending;

  return (
    <div className="container max-w-3xl py-8 space-y-8">
      <PageHeader
        title="Account settings"
        description="Manage your account and your data."
        explainer={pageExplainers.settings}
      />

      <ProfileSection />
      <PasswordSection />
      <BillingSection />
      <IntegrationsSection />

      <section className="rounded-lg border p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Notifications</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which emails you want to receive. Account and billing notices cannot be turned
            off.
          </p>
        </div>

        {prefsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading preferences…</span>
          </div>
        ) : prefsIsError ? (
          <ErrorState
            title="Couldn't load notification preferences"
            onRetry={() => refetchPrefs()}
            isRetrying={prefsIsRefetching}
          />
        ) : preferences.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notification types configured.</p>
        ) : (
          <ul className="space-y-4">
            {preferences.map((pref) => (
              <li
                key={pref.type}
                className="flex items-start justify-between gap-4"
                data-testid={`notification-pref-${pref.type}`}
              >
                <div className="flex-1">
                  <Label htmlFor={`pref-${pref.type}`} className="text-sm font-medium">
                    {pref.label}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-0.5">{pref.description}</p>
                </div>
                <Switch
                  id={`pref-${pref.type}`}
                  checked={pref.emailEnabled}
                  disabled={prefMutation.isPending}
                  onCheckedChange={(checked) =>
                    prefMutation.mutate({ type: pref.type, emailEnabled: checked })
                  }
                  aria-label={`Toggle ${pref.label}`}
                  data-testid={`switch-${pref.type}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="text-base font-semibold">Onboarding tours</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Auto-firing tours appear on first visit to new pages. Manual replay via the "?" icon stays
          available regardless of this setting.
        </p>
        <div className="flex items-center justify-between mt-4">
          <label htmlFor="suppress-tours" className="text-sm font-medium">
            Don't auto-show tours
          </label>
          <Switch
            id="suppress-tours"
            checked={wildcardSuppressed}
            onCheckedChange={toggleWildcard}
          />
        </div>
      </section>

      <section className="rounded-lg border border-border p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Delete account</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Schedules permanent deletion of your account and every brand, article, and citation tied
            to it. You have 30 days to contact support and cancel; after that the data is
            unrecoverable.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="delete-password">Confirm password</Label>
          <Input
            id="delete-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your account password"
            autoComplete="current-password"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="delete-confirm">
            Type <span className="font-mono font-bold">DELETE</span> to confirm
          </Label>
          <Input
            id="delete-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
          />
        </div>

        <Button variant="destructive" disabled={!canSubmit} onClick={() => deleteMutation.mutate()}>
          {deleteMutation.isPending ? "Scheduling…" : "Schedule account deletion"}
        </Button>
      </section>

      <section className="rounded-lg border p-6 space-y-3">
        <h2 className="text-lg font-semibold">Export your data</h2>
        <p className="text-sm text-muted-foreground">
          Download every brand, article, and citation tied to your account as a JSON file.
          Rate-limited to one export per day per account.
        </p>
        <Button
          variant="outline"
          disabled={exportMutation.isPending}
          onClick={() => exportMutation.mutate()}
        >
          {exportMutation.isPending ? "Preparing…" : "Download my data (JSON)"}
        </Button>
      </section>
    </div>
  );
}
