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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { resolveTier } from "@shared/schema";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { getAccessToken } from "@/lib/authStore";
import BufferConnectDialog from "@/components/articles/BufferConnectDialog";
import PageHeader from "@/components/PageHeader";
import { pageExplainers } from "@/lib/pageExplainers";
import { isAllowedStripeRedirect } from "@/lib/urlSafety";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useTourState, useTourStatePatch } from "@/hooks/useTourState";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/components/ThemeProvider";
import { Panel, PanelPage, PanelRow } from "@/components/dashboard-panels/Panel";
import { PanelLabel } from "@/components/dashboard-panels/primitives";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

// Profile - first name, last name, timezone. Initial values come from the
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
    <Panel label="Profile">
      <p className="mb-4 text-data text-vc-tertiary">
        Signed in as{" "}
        <span className="font-medium text-vc-primary">{user?.email ?? "(no email)"}</span>
      </p>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="firstName" className="text-caption text-vc-secondary">
              First name
            </Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={100}
              data-testid="input-first-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName" className="text-caption text-vc-secondary">
              Last name
            </Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={100}
              data-testid="input-last-name"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="timezone" className="text-caption text-vc-secondary">
            Timezone
          </Label>
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
      </div>
    </Panel>
  );
}

// Appearance - light / dark / system. Persists per-browser via
// localStorage; the FOUC-blocking script in client/index.html applies the
// chosen theme before React mounts, so this section is purely a write
// surface. The current resolved theme is shown as a quiet inline hint
// so users on "System" know whether they're currently in light or dark.
function AppearanceSection() {
  const { theme, resolvedTheme } = useTheme();
  const hint =
    theme === "system" ? `Following your system. Currently ${resolvedTheme}.` : `Always ${theme}.`;
  return (
    <Panel label="Appearance">
      <p className="mb-4 text-data text-vc-tertiary">
        Choose how VentureCite looks to you. System follows your operating system; Light and Dark
        stay put across reloads and devices on this browser.
      </p>
      <div className="space-y-3">
        <ThemeToggle />
        <p className="text-caption text-vc-tertiary tabular-nums">{hint}</p>
      </div>
    </Panel>
  );
}

// Password change - re-authenticates by requiring the current password.
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
    <Panel label="Change password">
      <p className="mb-4 text-data text-vc-tertiary">Minimum 8 characters.</p>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="currentPassword" className="text-caption text-vc-secondary">
            Current password
          </Label>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            data-testid="input-current-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="newPassword" className="text-caption text-vc-secondary">
            New password
          </Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            data-testid="input-new-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-caption text-vc-secondary">
            Confirm new password
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            data-testid="input-confirm-password"
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-caption text-destructive">Passwords don&apos;t match.</p>
          )}
        </div>
        <Button
          onClick={() => changePassword.mutate({ currentPassword, newPassword })}
          disabled={!canSubmit}
          data-testid="button-change-password"
        >
          {changePassword.isPending ? "Changing…" : "Change password"}
        </Button>
      </div>
    </Panel>
  );
}

// Billing - bounces the user to a Stripe customer portal session.
interface SubscriptionInfo {
  status: string;
  planName: string | null;
  tier: string | null;
  amount: number | null;
  currency: string;
  interval: string;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd: boolean;
  trialEnd?: number | null;
}

/** Only the fields the plan switcher reads out of /api/stripe/products. */
interface StripeProductLite {
  id: string;
  name: string;
  metadata: Record<string, string>;
  prices: {
    id: string;
    unit_amount: number;
    currency: string;
    recurring: { interval: string } | null;
  }[];
}

interface PlanOption {
  tier: string;
  priceId: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
}

interface InvoiceRow {
  id: string;
  number: string | null;
  status: string;
  amountPaid: number;
  amountDue: number;
  currency: string;
  created: number;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
    cents / 100,
  );

const shortDate = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function BillingSection() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PlanOption | null>(null);

  // resolveTier, not the raw column - a lapsed trial showed "Current plan:
  // trial" while having no entitlements at all.
  const plan = user ? resolveTier(user) : "free";

  const { data: subResp, isLoading: subLoading } = useQuery<{
    success: boolean;
    data: SubscriptionInfo | null;
  }>({ queryKey: ["/api/billing/subscription"] });
  const sub = subResp?.data ?? null;

  const { data: invResp, isLoading: invLoading } = useQuery<{
    success: boolean;
    data: InvoiceRow[];
  }>({ queryKey: ["/api/billing/invoices"] });
  const invoices = invResp?.data ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  const cancel = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/billing/cancel")).json(),
    onSuccess: (data: { success?: boolean; error?: string }) => {
      setConfirmCancel(false);
      if (!data?.success) {
        toast({ description: data?.error ?? "Could not cancel", variant: "destructive" });
        return;
      }
      refresh();
      toast({
        title: "Subscription cancelled",
        description: "You keep full access until the end of the period you have paid for.",
      });
    },
    onError: (err: unknown) =>
      toast({ description: getApiErrorMessage(err, "Could not cancel"), variant: "destructive" }),
  });

  const resume = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/billing/resume")).json(),
    onSuccess: (data: { success?: boolean; error?: string }) => {
      if (!data?.success) {
        toast({ description: data?.error ?? "Could not resume", variant: "destructive" });
        return;
      }
      refresh();
      toast({ title: "Subscription resumed", description: "Your plan will renew as normal." });
    },
    onError: (err: unknown) =>
      toast({ description: getApiErrorMessage(err, "Could not resume"), variant: "destructive" }),
  });

  const openPortal = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/portal-session");
      const json = (await res.json()) as { url?: string };
      if (!json.url) throw new Error("Failed to open billing portal");
      return json as { url: string };
    },
    onSuccess: ({ url }) => {
      if (isAllowedStripeRedirect(url)) {
        window.location.href = url;
      } else {
        toast({
          description: "Received an unexpected redirect URL from the server.",
          variant: "destructive",
        });
      }
    },
    onError: (err: unknown) =>
      toast({
        description: getApiErrorMessage(err, "Failed to open billing portal"),
        variant: "destructive",
      }),
  });

  // The sellable catalogue, minus whatever they are already on. Prices come
  // from Stripe rather than a constant here: a hardcoded amount eventually
  // lies about what the card is charged.
  const { data: prodResp } = useQuery<{ success: boolean; data: StripeProductLite[] }>({
    queryKey: ["/api/stripe/products"],
  });
  const otherPlans: PlanOption[] = (prodResp?.data ?? [])
    .flatMap((p) => {
      const tier = p.metadata?.tier;
      const price = p.prices?.[0];
      // A product with no tier metadata or no price is not sellable - the same
      // rule the webhook handler applies before granting entitlements.
      if (!tier || !price || tier === sub?.tier) return [];
      return [
        {
          tier,
          priceId: price.id,
          name: p.name,
          amount: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval ?? "month",
        },
      ];
    })
    .sort((a, b) => a.amount - b.amount);

  const switchPlan = useMutation({
    mutationFn: async (priceId: string) =>
      (await apiRequest("POST", "/api/stripe/checkout", { priceId })).json(),
    onSuccess: (data: { success?: boolean; updated?: boolean; url?: string; error?: string }) => {
      setPendingPlan(null);
      // An existing subscription is swapped in place and billed immediately,
      // so there is no URL to follow - the change is already live. Only a
      // customer with no live subscription gets sent to Checkout.
      if (data?.updated) {
        refresh();
        void queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
        // The tier on the "Current plan" line is our own mirror of Stripe, and
        // it is written by the subscription.updated webhook - which is still
        // in flight when this response arrives. Measured: the summary read
        // "Agency" while the tier line still said "pro". One delayed refetch
        // closes the gap.
        // ponytail: a fixed delay, not a poll. Getting it wrong just means
        // the label lags until the next navigation, which is what it did
        // before.
        setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }), 2500);
        toast({
          title: "Plan updated",
          description: "Your new plan is active. We've billed the difference for this period.",
        });
        return;
      }
      if (data?.url && isAllowedStripeRedirect(data.url)) {
        window.location.href = data.url;
        return;
      }
      toast({
        description: data?.error ?? "Could not change your plan",
        variant: "destructive",
      });
    },
    onError: (err: unknown) =>
      toast({
        description: getApiErrorMessage(err, "Could not change your plan"),
        variant: "destructive",
      }),
  });

  const trialing = sub?.status === "trialing";

  return (
    <Panel label="Billing">
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-caption text-vc-tertiary" data-testid="text-billing-plan">
            Current plan: <span className="font-medium text-vc-primary">{plan}</span>
          </p>

          {subLoading ? (
            <p className="text-caption text-vc-tertiary">Loading your subscription…</p>
          ) : !sub ? (
            <p className="text-caption text-vc-tertiary" data-testid="text-no-subscription">
              No active subscription.
            </p>
          ) : (
            <div className="space-y-1 text-caption text-vc-secondary">
              <p data-testid="text-subscription-summary">
                {sub.planName ?? "Subscription"}
                {sub.amount != null && ` - ${money(sub.amount, sub.currency)}/${sub.interval}`}
              </p>
              {/* The states a live subscription can be in are worded
                  differently on purpose. "Renews" and "ends" are opposite
                  promises, and a trial that is about to take money for the
                  first time deserves to say so plainly.
                  past_due comes first: a failed payment outranks every other
                  fact here, and it is the only one the customer must act on. */}
              {sub.status === "past_due" ? (
                <p className="font-medium text-warning" data-testid="text-past-due">
                  Your last payment failed. We&apos;ll keep retrying - update your payment method to
                  fix it now. Your access continues in the meantime.
                </p>
              ) : sub.cancelAtPeriodEnd ? (
                <p className="font-medium text-warning" data-testid="text-cancels-on">
                  Cancels on {sub.currentPeriodEnd ? shortDate(sub.currentPeriodEnd) : "period end"}
                  . You keep access until then.
                </p>
              ) : trialing && sub.trialEnd ? (
                <p data-testid="text-trial-ends">
                  Free trial - first charge on {shortDate(sub.trialEnd)}
                </p>
              ) : sub.currentPeriodEnd ? (
                <p data-testid="text-renews-on">Renews on {shortDate(sub.currentPeriodEnd)}</p>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => openPortal.mutate()}
            disabled={openPortal.isPending}
            data-testid="button-manage-billing"
          >
            {openPortal.isPending ? "Opening…" : "Payment method"}
          </Button>

          {/* Cancel and Resume are mutually exclusive - a subscription is
              either running or already winding down. Showing both would put a
              destructive action next to its own undo. */}
          {sub && !sub.cancelAtPeriodEnd && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmCancel(true)}
              data-testid="button-cancel-subscription"
            >
              Cancel subscription
            </Button>
          )}
          {sub?.cancelAtPeriodEnd && (
            <Button
              onClick={() => resume.mutate()}
              disabled={resume.isPending}
              data-testid="button-resume-subscription"
            >
              {resume.isPending ? "Resuming…" : "Resume subscription"}
            </Button>
          )}
        </div>

        {/* Changing plan lived only on the pricing page, which is written for
            people who have not bought yet - an existing customer had to go
            back out to a sales page to spend more money. The swap happens on
            the subscription they already have (no second checkout, no new
            trial), so it belongs next to the subscription itself.
            Hidden when there is nothing to switch: without a live
            subscription the right action is to start one, which is what the
            pricing page is for. */}
        {sub && otherPlans.length > 0 && (
          <div>
            <PanelLabel>Change plan</PanelLabel>
            <ul className="mt-2 divide-y divide-vc-subtle" data-testid="list-plan-options">
              {otherPlans.map((p) => (
                <li key={p.priceId} className="flex items-center justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <p className="text-caption text-vc-primary">{p.name}</p>
                    <p className="text-label text-vc-tertiary">
                      {money(p.amount, p.currency)}/{p.interval}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setPendingPlan(p)}
                    disabled={switchPlan.isPending}
                    data-testid={`button-switch-${p.tier}`}
                  >
                    {p.amount > (sub.amount ?? 0) ? "Upgrade" : "Downgrade"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <PanelLabel>Invoices</PanelLabel>
          {invLoading ? (
            <p className="mt-2 text-caption text-vc-tertiary">Loading invoices…</p>
          ) : invoices.length === 0 ? (
            <p className="mt-2 text-caption text-vc-tertiary" data-testid="text-no-invoices">
              No invoices yet. Your first one appears after the trial converts.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-vc-subtle" data-testid="list-invoices">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <p className="text-caption text-vc-primary">
                      {shortDate(inv.created)}
                      {inv.number && (
                        <span className="ml-2 font-mono text-label text-vc-tertiary">
                          {inv.number}
                        </span>
                      )}
                    </p>
                    {/* Anything not paid is called out. A quiet row for an
                        unpaid invoice is how customers end up surprised by a
                        lapsed account. */}
                    {inv.status !== "paid" && (
                      <p className="text-label capitalize text-warning">{inv.status}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-data tabular-nums text-vc-secondary">
                      {money(inv.status === "paid" ? inv.amountPaid : inv.amountDue, inv.currency)}
                    </span>
                    {inv.invoicePdf && (
                      <a
                        href={inv.invoicePdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-label font-medium text-vc-accent hover:underline"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              {trialing
                ? `You won't be charged. Your trial keeps running until ${
                    sub?.trialEnd ? shortDate(sub.trialEnd) : "it ends"
                  }.`
                : `You keep full access until ${
                    sub?.currentPeriodEnd
                      ? shortDate(sub.currentPeriodEnd)
                      : "the end of this period"
                  }.`}{" "}
              After that your brands and results stay visible, but scans and content generation
              stop. You can resume any time before then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my plan</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
              data-testid="button-confirm-cancel"
            >
              {cancel.isPending ? "Cancelling…" : "Cancel subscription"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Money moves the moment this is confirmed, so the dialog says which
          direction and roughly when - a switch that silently charges a card is
          the kind of surprise that becomes a dispute. The exact figure is
          Stripe's to compute from the unused time on the current plan, so this
          does not invent one. */}
      <AlertDialog open={!!pendingPlan} onOpenChange={(open) => !open && setPendingPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to {pendingPlan?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingPlan && pendingPlan.amount > (sub?.amount ?? 0)
                ? `You'll be charged the difference for the rest of this period straight away, then ${money(
                    pendingPlan.amount,
                    pendingPlan.currency,
                  )}/${pendingPlan.interval} from your next renewal. The new limits apply immediately.`
                : pendingPlan
                  ? `The unused part of your current plan is credited against your next invoice, which will be ${money(
                      pendingPlan.amount,
                      pendingPlan.currency,
                    )}/${pendingPlan.interval}. Your lower limits apply immediately, so anything over them stops running.`
                  : ""}{" "}
              Your billing date does not change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my plan</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingPlan && switchPlan.mutate(pendingPlan.priceId)}
              disabled={switchPlan.isPending}
              data-testid="button-confirm-switch"
            >
              {switchPlan.isPending ? "Switching…" : `Switch to ${pendingPlan?.name ?? "plan"}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

// Integrations - uses /api/buffer/status as the connection-status probe.
// That endpoint is a cheap DB lookup (no fan-out to Buffer's GraphQL API),
// so it's safe to call on every Settings mount. Uses a raw fetch so a 5xx
// doesn't push the query into an error state - we just render "Not
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
    <Panel label="Integrations">
      <div className="flex items-center justify-between border border-vc-default p-3">
        <div>
          <p className="font-medium text-vc-primary">Buffer</p>
          <p className="text-caption text-vc-tertiary">
            {connected ? "Connected" : "Not connected"}
          </p>
        </div>
        <BufferConnectDialog connected={connected} />
      </div>
    </Panel>
  );
}

export default function Settings() {
  const { logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const { state: tourState, isReady: tourStateReady } = useTourState();
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
      // Sign out - the auth middleware will refuse the user from here on.
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
    <PanelPage>
      <div className="px-8 py-6">
        <PageHeader
          title="Account settings"
          description="Manage your account and your data."
          explainer={pageExplainers.settings}
        />
      </div>

      <PanelRow cols={1}>
        <Panel width="wide" border="last">
          <ProfileSection />
        </Panel>
      </PanelRow>
      <PanelRow cols={1}>
        <Panel width="wide" border="last">
          <AppearanceSection />
        </Panel>
      </PanelRow>
      <PanelRow cols={1}>
        <Panel width="wide" border="last">
          <PasswordSection />
        </Panel>
      </PanelRow>
      <PanelRow cols={1}>
        <Panel width="wide" border="last">
          <BillingSection />
        </Panel>
      </PanelRow>
      <PanelRow cols={1}>
        <Panel width="wide" border="last">
          <IntegrationsSection />
        </Panel>
      </PanelRow>

      <PanelRow cols={1}>
        <Panel label="Notifications" width="wide" border="last">
          <p className="mb-4 text-data text-vc-tertiary">
            Choose which emails you want to receive. Account and billing notices cannot be turned
            off.
          </p>

          {prefsLoading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-5 w-9 rounded-full" />
                </div>
              ))}
            </div>
          ) : prefsIsError ? (
            <ErrorState
              title="Couldn't load notification preferences"
              onRetry={() => refetchPrefs()}
              isRetrying={prefsIsRefetching}
            />
          ) : preferences.length === 0 ? (
            <p className="text-caption text-vc-tertiary">No notification types configured.</p>
          ) : (
            <ul className="space-y-4">
              {preferences.map((pref) => (
                <li
                  key={pref.type}
                  className="flex items-start justify-between gap-4"
                  data-testid={`notification-pref-${pref.type}`}
                >
                  <div className="flex-1">
                    <Label htmlFor={`pref-${pref.type}`} className="text-caption text-vc-secondary">
                      {pref.label}
                    </Label>
                    <p className="text-caption text-vc-tertiary mt-0.5">{pref.description}</p>
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
        </Panel>
      </PanelRow>

      <PanelRow cols={1}>
        <Panel label="Onboarding tours" width="wide" border="last">
          <p className="mb-4 text-data text-vc-tertiary">
            Auto-firing tours appear on first visit to new pages. Manual replay via the "?" icon
            stays available regardless of this setting.
          </p>
          <div className="flex items-center justify-between">
            <label htmlFor="suppress-tours" className="text-caption text-vc-secondary">
              Don't auto-show tours
            </label>
            {/* Disabled until the state actually arrives: an unloaded
                TourState is `{}`, which renders as "off" even for a user who
                has suppressed tours - and a click in that window writes the
                wrong value. Same root cause as the tour re-firing bug. */}
            <Switch
              id="suppress-tours"
              checked={wildcardSuppressed}
              disabled={!tourStateReady}
              onCheckedChange={toggleWildcard}
            />
          </div>
        </Panel>
      </PanelRow>

      <PanelRow cols={1}>
        <Panel label="Delete account" width="wide" border="last">
          <p className="mb-4 text-data text-vc-tertiary">
            Schedules permanent deletion of your account and every brand, article, and citation tied
            to it. You have 30 days to contact support and cancel; after that the data is
            unrecoverable.
          </p>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="delete-password" className="text-caption text-vc-secondary">
                Confirm password
              </Label>
              <Input
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your account password"
                autoComplete="current-password"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="delete-confirm" className="text-caption text-vc-secondary">
                Type <span className="font-mono font-semibold">DELETE</span> to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </div>

            <Button
              variant="destructive"
              disabled={!canSubmit}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Scheduling…" : "Schedule account deletion"}
            </Button>
          </div>
        </Panel>
      </PanelRow>

      <PanelRow cols={1} last>
        <Panel label="Export your data" width="wide" border="last">
          <p className="mb-4 text-data text-vc-tertiary">
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
        </Panel>
      </PanelRow>
    </PanelPage>
  );
}
