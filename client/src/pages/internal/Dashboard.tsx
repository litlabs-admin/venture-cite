import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PLAN_PRICE_CENTS } from "@shared/schema";

// ─── Internal dashboard ──────────────────────────────────────────────────────
// Reads /api/internal/kpis, which returns aggregate counts only - no emails,
// no ids, no per-user rows. Keep it that way: this page has no sign-in.
//
// Every number here is measured. Where a figure is derived rather than read
// (MRR), it is labelled as an estimate and its method is stated on screen, so
// nobody mistakes it for billing truth.

interface Kpis {
  totalUsers: number;
  activeBrands: number;
  usersByTier: Record<string, number>;
  payingUsers: number;
  payingByTier: Record<string, number>;
  signups7d: number;
  signups30d: number;
  totalArticles: number;
  totalPrompts: number;
  totalCitationRuns: number;
  citationRunsByStatus: Record<string, number>;
  totalCitationChecks: number;
  citedChecks: number;
}

const TIER_ORDER = ["admin", "enterprise", "agency", "pro", "beta", "free", "readonly", "pending"];

const nf = new Intl.NumberFormat("en-US");

export function Dashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/internal/kpis");
      if (!res.ok) throw new Error(String(res.status));
      setKpis((await res.json()) as Kpis);
      setState("ok");
    } catch {
      // A failed read must never render as zeroes - that would read as "you
      // have no users" rather than "we could not measure".
      setState("failed");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // MRR from the users Stripe actually has a subscription for, priced at list.
  // Deliberately not derived from access_tier: tier and paid state disagree in
  // the data (more users carry a paid tier than carry a Stripe subscription),
  // so tier-based revenue would overstate.
  const estMrrCents =
    kpis &&
    Object.entries(kpis.payingByTier).reduce((sum, [tier, count]) => {
      const price = (PLAN_PRICE_CENTS as Record<string, number>)[tier];
      return sum + (price ? price * count : 0);
    }, 0);

  const citedRate =
    kpis && kpis.totalCitationChecks > 0
      ? Math.round((kpis.citedChecks / kpis.totalCitationChecks) * 1000) / 10
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-vc-default px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-vc-primary">Dashboard</h1>
          <p className="mt-1 text-xs text-vc-tertiary">
            Live counts from the production database. Aggregates only.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-vc-default px-2.5 text-xs text-vc-secondary transition-colors hover:border-vc-hover hover:text-vc-primary"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${state === "loading" ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {state === "failed" && (
          <div className="rounded-lg border border-vc-default bg-vc-surface p-6 text-center">
            <p className="text-sm text-vc-primary">Could not load the numbers.</p>
            <p className="mt-1 text-xs text-vc-tertiary">
              Nothing is shown rather than showing zeroes, which would read as real data.
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 h-8 rounded-md bg-vc-accent px-3 text-xs font-medium text-white hover:bg-vc-accent-hover"
            >
              Try again
            </button>
          </div>
        )}

        {state === "loading" && !kpis && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-lg border border-vc-default bg-vc-muted"
              />
            ))}
          </div>
        )}

        {kpis && (
          <div className="space-y-6">
            <Section title="Accounts">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Total users" value={nf.format(kpis.totalUsers)} />
                <Stat
                  label="Active brands"
                  value={nf.format(kpis.activeBrands)}
                  hint="excludes deleted"
                />
                <Stat
                  label="Paying customers"
                  value={nf.format(kpis.payingUsers)}
                  hint="has a Stripe subscription"
                />
                <Stat
                  label="Est. MRR"
                  value={estMrrCents != null ? `$${nf.format(Math.round(estMrrCents / 100))}` : "–"}
                  hint="paying users × list price"
                />
              </div>
              <p className="mt-2 text-xs text-vc-tertiary">
                Est. MRR is calculated, not billed: Stripe-subscribed users priced at list. It
                ignores discounts, proration and partial periods. Trials are not shown at all —
                Stripe owns trial state and the database has no reliable local mirror of it.
              </p>
            </Section>

            <Section title="Growth">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Signups · last 7 days" value={nf.format(kpis.signups7d)} />
                <Stat label="Signups · last 30 days" value={nf.format(kpis.signups30d)} />
                <Stat
                  label="Brands per user"
                  value={
                    kpis.totalUsers > 0
                      ? (Math.round((kpis.activeBrands / kpis.totalUsers) * 100) / 100).toFixed(2)
                      : "–"
                  }
                />
                <Stat
                  label="Paid conversion"
                  value={
                    kpis.totalUsers > 0
                      ? `${Math.round((kpis.payingUsers / kpis.totalUsers) * 1000) / 10}%`
                      : "–"
                  }
                  hint="paying ÷ total users"
                />
              </div>
            </Section>

            <Section title="Users by tier">
              <TierBars
                byTier={kpis.usersByTier}
                payingByTier={kpis.payingByTier}
                total={kpis.totalUsers}
              />
            </Section>

            <Section title="Product usage">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Articles generated" value={nf.format(kpis.totalArticles)} />
                <Stat label="Tracked prompts" value={nf.format(kpis.totalPrompts)} />
                <Stat label="Citation runs" value={nf.format(kpis.totalCitationRuns)} />
                <Stat
                  label="Citation checks"
                  value={nf.format(kpis.totalCitationChecks)}
                  hint={citedRate != null ? `${citedRate}% cited` : undefined}
                />
              </div>
            </Section>

            {Object.keys(kpis.citationRunsByStatus).length > 0 && (
              <Section title="Citation runs by status">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(kpis.citationRunsByStatus)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => (
                      <span
                        key={status}
                        className="inline-flex items-center gap-2 rounded-md border border-vc-default bg-vc-surface px-2.5 py-1.5 text-xs"
                      >
                        <span className="capitalize text-vc-secondary">{status}</span>
                        <span className="font-mono tabular-nums text-vc-primary">
                          {nf.format(count)}
                        </span>
                      </span>
                    ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-vc-label">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-vc-default bg-vc-surface p-3.5">
      <p className="text-xs text-vc-tertiary">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-vc-primary">
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-vc-tertiary">{hint}</p>}
    </div>
  );
}

function TierBars({
  byTier,
  payingByTier,
  total,
}: {
  byTier: Record<string, number>;
  payingByTier: Record<string, number>;
  total: number;
}) {
  const rows = Object.entries(byTier).sort((a, b) => {
    const ai = TIER_ORDER.indexOf(a[0]);
    const bi = TIER_ORDER.indexOf(b[0]);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  const max = Math.max(1, ...rows.map(([, c]) => c));

  return (
    <div className="rounded-lg border border-vc-default bg-vc-surface p-3.5">
      <div className="space-y-2.5">
        {rows.map(([tier, count]) => {
          const paying = payingByTier[tier] ?? 0;
          return (
            <div key={tier} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs capitalize text-vc-secondary">{tier}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-vc-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(count / max) * 100}%`,
                    background: "var(--brand-accent)",
                  }}
                />
              </div>
              <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-vc-primary">
                {nf.format(count)}
              </span>
              <span className="w-24 shrink-0 text-right text-[11px] text-vc-tertiary">
                {paying > 0 ? `${nf.format(paying)} paying` : ""}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-vc-tertiary">
        {nf.format(total)} users total. “Paying” counts a live Stripe subscription, which is why it
        can be lower than the tier count — a tier can be granted without a subscription.
      </p>
    </div>
  );
}
