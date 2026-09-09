import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useBrandFacts } from "../data/brandFacts";
import { useWorkSummary } from "../data/workSummary";
import { FactReview } from "./FactReview";
import { FactTable } from "./FactTable";
import { PagesScanned } from "./PagesScanned";
import { StartRail } from "./StartRail";
import { needsReview, scannedPages } from "./factRows";

// Brand facts - composition only.
//
// Loading, error, no-brand and no-facts are all reachable here: this tree is
// gated by `AuthenticatedBareRoute`, which does not redirect a brand-less
// account away, and a brand with nothing extracted yet is an ordinary state
// of the product, not a failure. Every branch renders the same two-column
// frame so the screen does not jump as data arrives.

const COLUMN = "min-w-0 flex-1 px-8 py-6";
const RAIL =
  "w-full shrink-0 border-t border-vc-default px-8 py-6 lg:w-[322px] lg:border-t-0 lg:border-l lg:px-6";

function Frame({ main, rail }: { main: React.ReactNode; rail: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-stretch lg:flex-row">
      <div className={COLUMN}>{main}</div>
      <aside className={RAIL} aria-label="Your starting point">
        {rail}
      </aside>
    </div>
  );
}

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-vc-muted ${className}`} aria-hidden="true" />;
}

/**
 * The three setup steps, as a step indicator.
 *
 * Only this one has a route. The other two are rendered as plain, unlinked
 * steps rather than as links to nowhere - a typed `Link` cannot address a
 * route that is not in the tree, and a step that silently does nothing when
 * clicked is worse than one that reads as not-yet-open. This is the same
 * precedent `V2Nav` set for the nav items whose screens have not landed.
 */
const STEPS = ["Brand facts", "Buyer questions", "Baseline"] as const;

function StepBar() {
  return (
    <div className="mt-5 flex items-center gap-6 border-b border-vc-default" role="list">
      {STEPS.map((label, index) => {
        const active = index === 0;
        return (
          <div
            key={label}
            role="listitem"
            aria-current={active ? "step" : undefined}
            data-testid={`v2-fact-step-${index + 1}`}
            className={`-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-body ${
              active
                ? "border-vc-accent font-medium text-vc-accent"
                : "border-transparent text-vc-tertiary"
            }`}
          >
            <span
              className={`flex h-4.5 w-4.5 items-center justify-center rounded-full text-data tabular-nums ${
                active ? "bg-vc-accent text-white" : "bg-vc-muted text-vc-secondary"
              }`}
              aria-hidden="true"
            >
              {index + 1}
            </span>
            {label}
          </div>
        );
      })}
    </div>
  );
}

function Heading({ brandName }: { brandName: string }) {
  return (
    <>
      <h1 className="text-metric font-semibold text-vc-primary">Build a reliable starting point</h1>
      <p className="mt-2 text-body text-vc-secondary">
        Review what we know about {brandName} before measuring your visibility.
      </p>
    </>
  );
}

function LoadingFacts() {
  return (
    <div data-testid="v2-brand-facts-loading" role="status" aria-busy="true">
      <span className="sr-only">Loading brand facts</span>
      <Frame
        main={
          <>
            <Bar className="h-7 w-80" />
            <Bar className="mt-3 h-4 w-96" />
            <Bar className="mt-6 h-5 w-72" />
            <Bar className="mt-6 h-11 w-full" />
            <Bar className="mt-3 h-11 w-full" />
            <Bar className="mt-3 h-11 w-full" />
            <Bar className="mt-8 h-16 w-full" />
          </>
        }
        rail={
          <>
            <Bar className="h-10 w-40" />
            <Bar className="mt-5 h-4 w-48" />
            <Bar className="mt-3 h-4 w-full" />
            <Bar className="mt-2 h-4 w-full" />
          </>
        }
      />
    </div>
  );
}

/** No brands at all. Named, not blank: the account is new, not broken. */
function NoBrand() {
  return (
    <Frame
      main={
        <div data-testid="v2-brand-facts-no-brand" className="max-w-lg">
          <h1 className="text-metric font-semibold text-vc-primary">Add a brand to start</h1>
          <p className="mt-2 text-body text-vc-secondary">
            Facts are read per brand, and there is no brand on this account yet. Add one and its
            facts appear here for you to approve.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/welcome">Add a brand</Link>
          </Button>
        </div>
      }
      rail={
        <p className="text-body text-vc-secondary">
          Your starting steps appear with your first brand.
        </p>
      }
    />
  );
}

/**
 * A brand with no facts.
 *
 * THIS IS A REAL STATE, NOT AN ERROR, and the wording is the whole point. It
 * says nothing has been extracted. It must never read as "we checked and
 * everything is correct" - a brand whose facts were never read has had
 * nothing confirmed, and a reassuring empty state here would be the silent
 * approval this screen exists to prevent, at the scale of a whole brand.
 */
function NoFacts({
  brandName,
  summary,
}: {
  brandName: string;
  summary: ReturnType<typeof useWorkSummary>["data"];
}) {
  return (
    <Frame
      main={
        <>
          <Heading brandName={brandName} />
          <StepBar />
          <div data-testid="v2-brand-facts-empty" className="mt-8 max-w-lg">
            <h2 className="text-section font-semibold text-vc-primary">
              No facts have been extracted yet
            </h2>
            <p className="mt-2 text-body text-vc-secondary">
              Nothing has been read from {brandName}&apos;s pages, so there is nothing here to
              approve. This is not a clean bill of health: no fact has been checked, and none has
              been confirmed.
            </p>
            <p className="mt-2 text-body text-vc-secondary">
              Facts appear here once the brand&apos;s pages have been read for the first time.
            </p>
          </div>
        </>
      }
      rail={<StartRail summary={summary} factsApproved={false} reviewCount={0} />}
    />
  );
}

export default function BrandFactsPage() {
  const { selectedBrandId, selectedBrand, isLoading: brandsLoading } = useBrandSelection();
  const factsQuery = useBrandFacts(selectedBrandId);
  const summaryQuery = useWorkSummary(selectedBrandId ?? "");

  const facts = useMemo(() => factsQuery.data ?? [], [factsQuery.data]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  // The row under review defaults to the FIRST FACT STILL NEEDING ONE, and
  // falls back to the first row when everything is reviewed. This selects
  // what to READ; it never decides anything. Selection performs no mutation,
  // so opening this page - or landing on a row - approves nothing.
  const defaultId = useMemo(() => {
    return (facts.find(needsReview) ?? facts[0])?.id;
  }, [facts]);

  // A selection that no longer exists (the brand changed under the page) is
  // dropped rather than left pointing at a missing row.
  useEffect(() => {
    if (selectedId && !facts.some((fact) => fact.id === selectedId)) setSelectedId(undefined);
  }, [facts, selectedId]);

  const activeId = selectedId ?? defaultId;
  const active = facts.find((fact) => fact.id === activeId);
  const reviewCount = facts.filter(needsReview).length;
  const pages = useMemo(() => scannedPages(facts), [facts]);
  const brandName = selectedBrand?.name ?? "this brand";

  if (brandsLoading) return <LoadingFacts />;
  if (!selectedBrandId) return <NoBrand />;
  if (factsQuery.isPending) return <LoadingFacts />;

  if (factsQuery.isError) {
    return (
      <Frame
        main={
          <div data-testid="v2-brand-facts-error">
            <ErrorState
              title="Your brand facts could not be loaded"
              description="The fact sheet for this brand did not load. Nothing has been lost, and nothing has been approved - try again."
              onRetry={() => void factsQuery.refetch()}
              isRetrying={factsQuery.isFetching}
            />
          </div>
        }
        rail={
          <p className="text-body text-vc-secondary">
            Your starting steps are unavailable right now.
          </p>
        }
      />
    );
  }

  if (facts.length === 0) {
    return <NoFacts brandName={brandName} summary={summaryQuery.data} />;
  }

  return (
    <Frame
      main={
        <>
          <Heading brandName={brandName} />
          <StepBar />

          <section className="mt-8" aria-labelledby="v2-facts-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="v2-facts-heading" className="text-section font-semibold text-vc-primary">
                Confirm your facts
              </h2>
              {/* The count is a statement of what is outstanding, not a
                  control. There is deliberately no "approve all": see the
                  note in FactReview.tsx. */}
              <p className="text-caption text-vc-secondary" data-testid="v2-facts-review-count">
                {reviewCount === 0
                  ? `All ${facts.length} fact${facts.length === 1 ? "" : "s"} reviewed`
                  : `${reviewCount} of ${facts.length} still need your review`}
              </p>
            </div>

            <FactTable facts={facts} selectedId={activeId} onSelect={setSelectedId} />
          </section>

          {active && <FactReview key={active.id} fact={active} />}

          <PagesScanned pages={pages} />
        </>
      }
      rail={
        <StartRail
          summary={summaryQuery.data}
          factsApproved={facts.length > 0 && reviewCount === 0}
          reviewCount={reviewCount}
        />
      }
    />
  );
}
