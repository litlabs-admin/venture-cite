import { Link } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { resolveTier, TRIAL_DAYS, hasPurchasablePlan } from "@shared/schema";

// ─── Account state chrome ────────────────────────────────────────────────────
// Three states this renders for, and they are deliberately different in how
// hard they push:
//
//   pending    signed up, no plan chosen. The app is BLOCKED - the card is
//              collected before entry, so there is nothing to show yet and
//              nothing that could run without a subscription behind it.
//   trialing   inside the 14-day Stripe trial. A countdown banner, nothing
//              more. Stripe charges automatically on day 15.
//   readonly   trial cancelled, or a subscription that ultimately failed.
//              Their data STAYS VISIBLE - the app renders normally and only a
//              banner marks the state. Nothing new can be started, which is
//              enforced server-side by usageLimits.readonly being 0/0, so the
//              account costs no recurring spend while it sits here.
//
// The readonly case is deliberately NOT a paywall over the app. Every
// comparable product (Notion, Trello, Airtable) leaves lapsed accounts able to
// see what they built, and the research is clear that the visible-but-frozen
// state is what pulls people back - a wall they cannot see past just ends the
// relationship.

function daysLeft(trialEndsAt: string | null | undefined): number {
  if (!trialEndsAt) return 0;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return 0;
  // Round up: with 6 hours to go you are still on your last day, not on day
  // zero. Zero is reserved for a trial that is over.
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function TrialBanner() {
  const { user } = useAuth();
  if (!user) return null;

  const tier = resolveTier(user);

  if (tier === "readonly") {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-warning bg-warning-subtle px-4 py-2 text-caption text-warning">
        <span>Your subscription has ended. Your data is here, but new runs are paused.</span>
        <Link to="/pricing" className="font-medium underline">
          Reactivate
        </Link>
      </div>
    );
  }

  // Inside a Stripe trial: the tier is already the plan they chose, and
  // trialEndsAt mirrors the subscription's trial_end.
  const left = daysLeft(user.trialEndsAt);
  if (left <= 0) return null;

  const urgent = left <= 3;
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b px-4 py-2 text-caption ${
        urgent
          ? "border-warning bg-warning-subtle text-warning"
          : "border-vc-default bg-vc-muted/40 text-vc-secondary"
      }`}
    >
      <span>
        {left === 1 ? "Last day of your free trial" : `${left} days left in your free trial`}
        {urgent ? " - your card will be charged when it ends" : ""}
      </span>
      <Link to="/settings" className="font-medium text-vc-accent hover:underline">
        Manage plan
      </Link>
    </div>
  );
}

/**
 * Blocks the app for an account that has not chosen a plan yet.
 *
 * This is the "card before entering the app" gate. It exists because every
 * meaningful action in this product spends money on LLM calls, so there is no
 * useful state between "registered" and "has a subscription".
 */
export function TrialGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  // The catalogue, from the same public endpoint the pricing page uses.
  // Cheap: one cached request, shared query key.
  const { data: products, isLoading: productsLoading } = useQuery<{
    success: boolean;
    data: Array<{
      metadata?: Record<string, string> | null;
      prices?: Array<{ unit_amount?: number | null; currency?: string | null }> | null;
    }>;
  }>({ queryKey: ["/api/stripe/products"] });

  // Never gate on an unresolved session. resolveTier falls back to `pending`
  // for an unknown row, so gating mid-flight would flash this at every paying
  // customer on a cold load.
  if (isLoading || !user) return <>{children}</>;
  if (resolveTier(user) !== "pending") return <>{children}</>;

  // Do not block someone out of the app when there is nothing for them to buy.
  //
  // This gate's entire purpose is "go and pick a plan". If Stripe is carrying
  // no correctly-priced plan - a catalogue that has not been synced yet, or an
  // account still on the previous pricing - then blocking achieves nothing
  // except locking every new signup out with no way forward. It fails OPEN for
  // exactly as long as that is true, and starts gating by itself the moment a
  // real plan exists. No deploy needed to switch it on.
  //
  // The server is unaffected either way: usageLimits.pending is 0/0, so a
  // pending account still cannot start work that costs money.
  if (productsLoading) return <>{children}</>;
  if (!hasPurchasablePlan(products?.data ?? [])) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-vc-muted">
        <CreditCard className="h-5 w-5 text-vc-tertiary" aria-hidden />
      </div>
      <h1 className="mb-2 text-page font-semibold text-vc-primary">
        Choose your plan to get started
      </h1>
      <p className="mb-6 max-w-md text-ui text-vc-tertiary">
        Every plan starts with a {TRIAL_DAYS}-day free trial. You won&apos;t be charged until it
        ends, and you can cancel any time before then.
      </p>
      <Link
        to="/pricing"
        className="inline-flex h-9 items-center rounded bg-vc-accent px-4 text-caption font-medium text-primary-foreground transition-colors hover:bg-vc-accent-hover"
      >
        See plans
      </Link>
    </div>
  );
}
