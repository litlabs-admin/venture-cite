import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
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
import type { V2ScreenProps } from "@/v2/contracts/screen";
import { Chip } from "@/v2/shared/ui/Chip";
import { DataTable, type DataColumn } from "@/v2/shared/ui/DataTable";
import { InfoNote } from "@/v2/shared/ui/InfoNote";
import { InlineAlert } from "@/v2/shared/ui/InlineAlert";
import { Meter } from "@/v2/shared/ui/Meter";
import { Panel, PanelHeader } from "@/v2/shared/ui/Panel";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import { SettingsNav } from "./shared/SettingsNav";

export type Board44Plan = {
  name: string;
  description: string;
  status: string;
  nextRenewalAt: string | null;
  monthlyPriceCents: number | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
};

export type Board44UsageRow = { used: number; limit: number | null };

export type Board44Invoice = {
  id: string;
  dateIso: string;
  number: string | null;
  description: string;
  amountCents: number;
  status: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};

export type Board44Data = {
  brandId: string;
  mode: "guided" | "expert";
  brandName: string;
  /** null = no active subscription (never subscribed, or Stripe is disabled locally). */
  plan: Board44Plan | null;
  paymentMethodNote: string;
  usage: {
    periodDays: number;
    brands: Board44UsageRow;
    trackedQuestions: Board44UsageRow;
    citationRuns: Board44UsageRow;
    contentGenerated: Board44UsageRow;
  };
  invoices: Board44Invoice[];
  billingContact: { name: string; email: string | null };
  retentionDays: number;
  /** Live actions. Omitted (fixture/preview) means the control renders disabled. */
  actions?: {
    onManageBilling?: () => void;
    isManageBillingPending?: boolean;
    onCancelPlan?: () => void;
    isCancelPending?: boolean;
    onResumePlan?: () => void;
    isResumePending?: boolean;
  };
};

function money(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function shortDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(iso: string): number | null {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.round((target - Date.now()) / 86_400_000));
}

function UsageRow({
  icon,
  label,
  used,
  limit,
  caption,
}: {
  icon: "facts" | "srch" | "chart" | "doc";
  label: string;
  used: number;
  limit: number | null;
  caption: string;
}) {
  const unlimited = limit !== null && limit < 0;
  const percent = limit && limit > 0 ? Math.min(100, (used / limit) * 100) : null;
  return (
    <div className="flex items-start gap-3 border-t border-[var(--v2-line)] py-3 first:border-t-0 first:pt-0">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)]">
        <V2Icon name={icon} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cnBody}>{label}</span>
          {percent !== null ? (
            <Meter className="min-w-[80px] flex-1" value={percent} />
          ) : (
            <span className="flex-1" />
          )}
          <span className={`${v2Type.num} font-semibold text-[color:var(--v2-ink)]`}>
            {unlimited || limit === null ? used : `${used} of ${limit}`}
          </span>
        </div>
        <p className={`${v2Type.meta} mt-0.5`}>{caption}</p>
      </div>
    </div>
  );
}

const cnBody = `${v2Type.bodyStrong} w-[168px] shrink-0`;

function InvoiceRowActions({ invoice }: { invoice: Board44Invoice }) {
  const href = invoice.invoicePdf ?? invoice.hostedInvoiceUrl;
  if (!href) return <StateLabel state="not-measured" />;
  return (
    <a
      className="inline-flex items-center gap-1.5 font-semibold text-[color:var(--v2-brand)] hover:underline"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      <V2Icon name="dl" size={13} />
      Download
    </a>
  );
}

function PlanPanel({ data }: { data: Board44Data }) {
  const { plan, actions } = data;
  if (!plan) {
    return (
      <Panel className="mb-4" padding="spacious">
        <PanelHeader title="Your plan" />
        <InlineAlert tone="neutral" title="No active subscription">
          {data.paymentMethodNote} Choose a plan to unlock tracking, measurement, and content work.
        </InlineAlert>
        <Button asChild className="mt-4">
          <Link search={{ brandId: data.brandId, mode: data.mode }} to="/pricing">
            Choose a plan
          </Link>
        </Button>
      </Panel>
    );
  }

  const renewalDays = plan.nextRenewalAt ? daysUntil(plan.nextRenewalAt) : null;
  const latestInvoice = data.invoices[0];

  return (
    <Panel className="mb-4" padding="spacious">
      <PanelHeader title="Your plan" />
      <div className="flex flex-wrap items-start gap-6">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)]">
          <V2Icon name="star" size={20} />
        </span>
        <div className="min-w-[180px] flex-1">
          <div className="flex items-center gap-2">
            <span className={v2Type.cardTitle}>{plan.name}</span>
            <Chip
              tone={
                plan.status === "past_due" ? "bad" : plan.status === "trialing" ? "brand" : "ok"
              }
            >
              {plan.status === "past_due"
                ? "Payment failed"
                : plan.cancelAtPeriodEnd
                  ? "Cancels at period end"
                  : plan.status}
            </Chip>
          </div>
          <p className={`${v2Type.body} mt-1`}>{plan.description}</p>
        </div>
        <div className="min-w-[130px]">
          <p className={v2Type.caps}>Next renewal</p>
          {plan.nextRenewalAt ? (
            <>
              <p className={`${v2Type.bodyStrong} mt-1`}>{shortDate(plan.nextRenewalAt)}</p>
              {renewalDays !== null ? (
                <p className={v2Type.meta}>
                  {plan.cancelAtPeriodEnd ? "last day of access" : `in ${renewalDays} days`}
                </p>
              ) : null}
            </>
          ) : (
            <StateLabel className="mt-1" state="not-measured" />
          )}
        </div>
        <div className="min-w-[110px]">
          <p className={v2Type.caps}>Monthly price</p>
          {plan.monthlyPriceCents !== null ? (
            <>
              <p className={`${v2Type.bodyStrong} mt-1`}>{money(plan.monthlyPriceCents)}</p>
              <p className={v2Type.meta}>per month</p>
            </>
          ) : (
            <StateLabel className="mt-1" state="not-measured" />
          )}
        </div>
        <div className="min-w-[190px]">
          <p className={v2Type.caps}>Payment method</p>
          <p className={`${v2Type.body} mt-1`}>{data.paymentMethodNote}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={actions?.isManageBillingPending}
          onClick={actions?.onManageBilling}
          variant="outline"
        >
          {actions?.isManageBillingPending ? "Opening…" : "Manage plan"}
        </Button>
        <Button
          disabled={actions?.isManageBillingPending}
          onClick={actions?.onManageBilling}
          variant="outline"
        >
          Update payment method
        </Button>
        {latestInvoice ? (
          <Button asChild variant="outline">
            <a
              href={latestInvoice.invoicePdf ?? latestInvoice.hostedInvoiceUrl ?? undefined}
              rel="noopener noreferrer"
              target="_blank"
            >
              Download invoice
            </a>
          </Button>
        ) : (
          <Button disabled variant="outline">
            Download invoice
          </Button>
        )}
      </div>
    </Panel>
  );
}

function UsagePanel({ data }: { data: Board44Data }) {
  const { usage } = data;
  return (
    <Panel className="mb-4" padding="spacious">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className={v2Type.sectionTitle}>Usage this billing period</h2>
        <span className={v2Type.meta}>Trailing {usage.periodDays} days</span>
      </div>
      <UsageRow
        caption={
          usage.brands.limit !== null && usage.brands.limit >= 0
            ? `You can track up to ${usage.brands.limit} brand${usage.brands.limit === 1 ? "" : "s"} on your current plan.`
            : "Your plan does not limit the number of brands you can track."
        }
        icon="facts"
        label="Brands"
        limit={usage.brands.limit}
        used={usage.brands.used}
      />
      <UsageRow
        caption="Questions currently tracked for this brand, out of the platform cap."
        icon="srch"
        label="Tracked questions"
        limit={usage.trackedQuestions.limit}
        used={usage.trackedQuestions.used}
      />
      <UsageRow
        caption={`Citation checks run for this brand in the last ${usage.periodDays} days. No plan limit applies.`}
        icon="chart"
        label="Citation runs"
        limit={null}
        used={usage.citationRuns.used}
      />
      <UsageRow
        caption={
          usage.contentGenerated.limit === 0
            ? "Content generation is not part of your current plan."
            : usage.contentGenerated.limit !== null && usage.contentGenerated.limit >= 0
              ? `Articles generated this month, out of ${usage.contentGenerated.limit} on your plan.`
              : "Your plan does not limit content generation."
        }
        icon="doc"
        label="Content generated"
        limit={usage.contentGenerated.limit}
        used={usage.contentGenerated.used}
      />
      <InfoNote className="mt-4">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            Failed attempts count. Each approved question run counts toward your plan, even if it
            fails.
          </li>
          <li>
            If you go over a limit, we&apos;ll notify you and give you options to upgrade. We
            don&apos;t block your work.
          </li>
          <li>Work points do not affect billing and can be used freely by your team.</li>
        </ul>
      </InfoNote>
    </Panel>
  );
}

function InvoicesPanel({ invoices }: { invoices: Board44Invoice[] }) {
  const columns: readonly DataColumn<Board44Invoice>[] = [
    { key: "dateIso", header: "Date", wrap: false, render: (row) => shortDate(row.dateIso) },
    {
      key: "number",
      header: "Invoice #",
      wrap: false,
      render: (row) => row.number ?? <StateLabel state="not-measured" />,
    },
    { key: "description", header: "Description" },
    {
      key: "amountCents",
      header: "Amount",
      numeric: true,
      wrap: false,
      render: (row) => money(row.amountCents),
    },
    {
      key: "status",
      header: "Status",
      wrap: false,
      render: (row) => (
        <Chip tone={row.status === "paid" ? "ok" : row.status === "open" ? "warn" : "neutral"}>
          {row.status}
        </Chip>
      ),
    },
    {
      key: "id",
      header: "Action",
      wrap: false,
      render: (row) => <InvoiceRowActions invoice={row} />,
    },
  ];
  return (
    <Panel padding="spacious">
      <PanelHeader title="Invoice history" />
      <DataTable
        columns={columns}
        emptyMessage="No invoices yet. Your first one appears after checkout."
        rowKey={(row) => row.id}
        rows={invoices}
      />
    </Panel>
  );
}

function RightRail({ data }: { data: Board44Data }) {
  const { plan, actions } = data;
  const [confirmCancel, setConfirmCancel] = useState(false);

  return (
    <div className="min-w-0 space-y-5">
      <section>
        <h3 className={v2Type.sectionTitle}>Plan renewal</h3>
        {plan?.nextRenewalAt ? (
          <>
            <p className={`${v2Type.pageTitle} mt-2 text-[22px]`}>
              {shortDate(plan.nextRenewalAt)}
            </p>
            <p className={`${v2Type.body} mt-2`}>
              {plan.cancelAtPeriodEnd
                ? "Your plan will not renew - it ends on this date."
                : `Your ${plan.name} will automatically renew${
                    plan.monthlyPriceCents !== null
                      ? ` for ${money(plan.monthlyPriceCents)} per month`
                      : ""
                  }.`}
            </p>
          </>
        ) : (
          <p className={`${v2Type.body} mt-2`}>No renewal is scheduled.</p>
        )}
        <Button
          className="mt-3 w-full"
          disabled={actions?.isManageBillingPending}
          onClick={actions?.onManageBilling}
          variant="outline"
        >
          Manage plan
        </Button>
        <Link
          className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-[color:var(--v2-brand)] hover:underline"
          search={{ brandId: data.brandId, mode: data.mode }}
          to="/pricing"
        >
          Compare plans
          <V2Icon name="arrow" size={12} />
        </Link>
      </section>

      <section className="border-t border-[var(--v2-line)] pt-5">
        <h3 className={v2Type.sectionTitle}>Billing contact</h3>
        <p className={`${v2Type.bodyStrong} mt-2`}>{data.billingContact.name}</p>
        <p className={`${v2Type.meta} mt-0.5`}>{data.billingContact.email ?? "No email on file"}</p>
        <Button
          className="mt-3 w-full"
          disabled={actions?.isManageBillingPending}
          onClick={actions?.onManageBilling}
          variant="outline"
        >
          Update billing contact
        </Button>
      </section>

      {plan ? (
        <section className="border-t border-[var(--v2-line)] pt-5">
          <h3 className={`${v2Type.sectionTitle} text-[color:var(--v2-bad)]`}>Cancellation</h3>
          {plan.cancelAtPeriodEnd ? (
            <>
              <p className={`${v2Type.bodyStrong} mt-2`}>Your plan is set to cancel</p>
              <p className={`${v2Type.body} mt-1`}>
                {plan.nextRenewalAt
                  ? `You keep access until ${shortDate(plan.nextRenewalAt)}. You can resume any time before then.`
                  : "You keep access until the end of the current period."}
              </p>
              <Button
                className="mt-3 w-full"
                disabled={actions?.isResumePending}
                onClick={actions?.onResumePlan}
              >
                {actions?.isResumePending ? "Resuming…" : "Resume plan"}
              </Button>
            </>
          ) : (
            <>
              <p className={`${v2Type.bodyStrong} mt-2`}>You can cancel anytime</p>
              <p className={`${v2Type.body} mt-1`}>
                {plan.nextRenewalAt
                  ? `If you cancel, your plan remains active until ${shortDate(plan.nextRenewalAt)}. You won't be charged again after that date.`
                  : "If you cancel, you keep access until the end of the period you already paid for."}
              </p>
              <Button
                className="mt-3 w-full border border-[var(--v2-line2)] bg-[var(--v2-paper)] text-[color:var(--v2-bad)] shadow-none hover:bg-[var(--v2-bad-soft,transparent)]"
                onClick={() => setConfirmCancel(true)}
                variant="ghost"
              >
                Cancel plan
              </Button>
            </>
          )}
        </section>
      ) : null}

      <section className="border-t border-[var(--v2-line)] pt-5">
        <h3 className={v2Type.sectionTitle}>Data retention after cancellation</h3>
        <p className={`${v2Type.body} mt-2`}>
          We keep your data for {data.retentionDays} days after cancellation, so you can export your
          results. After {data.retentionDays} days, your data is permanently deleted.
        </p>
      </section>

      <AlertDialog onOpenChange={setConfirmCancel} open={confirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your plan?</AlertDialogTitle>
            <AlertDialogDescription>
              {plan?.nextRenewalAt
                ? `You keep full access until ${shortDate(plan.nextRenewalAt)}. After that, brands and results stay visible, but scans and content generation stop.`
                : "You keep access until the end of the period you already paid for."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my plan</AlertDialogCancel>
            <AlertDialogAction
              disabled={actions?.isCancelPending}
              onClick={() => {
                actions?.onCancelPlan?.();
                setConfirmCancel(false);
              }}
            >
              {actions?.isCancelPending ? "Cancelling…" : "Cancel plan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function Board44Screen({ data }: V2ScreenProps<Board44Data>) {
  return (
    <div
      className="min-h-full text-[14px] leading-[1.5] text-[color:var(--v2-ink)]"
      data-testid="board44-screen"
    >
      <TwoColumn
        className="min-h-full gap-0"
        main={
          <div className="min-w-0 px-6 py-7">
            <SettingsNav active="billing" brandId={data.brandId} mode={data.mode} />
            <PageHeader
              sub="Manage your plan, see usage, and handle billing. Work points do not affect billing."
              title="Plan and usage"
            />
            <div className="mt-6">
              <PlanPanel data={data} />
              <UsagePanel data={data} />
              <InvoicesPanel invoices={data.invoices} />
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
