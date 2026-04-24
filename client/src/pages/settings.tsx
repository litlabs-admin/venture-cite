// Account settings page (Wave 2.2/2.3).
//
// Today this hosts only the GDPR-self-service blocks: account deletion
// + data export. Future settings (notifications, integrations, billing)
// can grow here as their own sections.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { getAccessToken } from "@/lib/authStore";
import PageHeader from "@/components/PageHeader";
import { Loader2 } from "lucide-react";

type NotificationPreference = {
  type: string;
  label: string;
  description: string;
  channel: "email";
  emailEnabled: boolean;
};

export default function Settings() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const prefsQueryKey = ["/api/user/notification-preferences"];
  const { data: prefsData, isLoading: prefsLoading } = useQuery<{
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
        description: err instanceof Error ? err.message : "Unexpected error.",
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
        throw new Error("Already exported in the last 24 hours. Try again tomorrow.");
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
        description: err instanceof Error ? err.message : "Unexpected error.",
        variant: "destructive",
      });
    },
  });

  const canSubmit = password.length > 0 && confirm === "DELETE" && !deleteMutation.isPending;

  return (
    <div className="container max-w-3xl py-8 space-y-8">
      <PageHeader title="Account settings" description="Manage your account and your data." />

      <section className="rounded-lg border p-6 space-y-3">
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium">{user?.email ?? "(no email)"}</span>
        </p>
      </section>

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

      <section className="rounded-lg border border-destructive/40 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-destructive">Delete account</h2>
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
