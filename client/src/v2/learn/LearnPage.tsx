import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { NotWrittenPanel } from "./LearnNotice";
import { LearnRail } from "./LearnRail";

// Learn - a navigable prototype, and honest about being one.
//
// There is no artboard for this area. The frame below is taken from the two
// boards either side of it (Today and Brand facts): a `min-w-0 flex-1` content
// column at `px-8 py-6`, a 322px right rail with a left hairline that becomes a
// top hairline below `lg`, a `text-metric` heading with a one-line subtitle
// under it. Reading as the same product is the whole reason to reuse it.
//
// THE CONTENT IS NOT REAL AND MUST NEVER LOOK AS IF IT WERE. This screen
// fetches nothing, because there is nothing to fetch: no lesson content exists.
// It therefore has no error state and no populated state - inventing either
// would mean inventing lessons. What it does have is the states that are
// genuinely reachable from `useBrandSelection`, which every screen in this tree
// shares: brands still loading, and an account with no brand at all.

const COLUMN = "min-w-0 flex-1 px-8 py-6";
const RAIL =
  "w-full shrink-0 border-t border-vc-default px-8 py-6 lg:w-[322px] lg:border-t-0 lg:border-l lg:px-6";

function Frame({ main, rail }: { main: React.ReactNode; rail: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-stretch lg:flex-row">
      <div className={COLUMN}>{main}</div>
      <aside className={RAIL} aria-label="Learn">
        {rail}
      </aside>
    </div>
  );
}

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-vc-muted ${className}`} aria-hidden="true" />;
}

/**
 * Brands are still loading.
 *
 * The skeleton stands in for the HEADING AND THE NOTICE, which are what this
 * screen actually renders. It deliberately draws no row-shaped bars: rows would
 * promise a list that never arrives, and a lesson list that resolves into "no
 * lessons" would read as a load failure rather than as the truth.
 */
function LoadingLearn() {
  return (
    <div data-testid="v2-learn-loading" role="status" aria-busy="true">
      <span className="sr-only">Loading Learn</span>
      <Frame
        main={
          <>
            <Bar className="h-7 w-80" />
            <Bar className="mt-3 h-4 w-96" />
            <Bar className="mt-6 h-32 w-full" />
          </>
        }
        rail={
          <>
            <Bar className="h-4 w-28" />
            <Bar className="mt-3 h-4 w-full" />
            <Bar className="mt-2 h-4 w-40" />
            <Bar className="mt-6 h-4 w-44" />
            <Bar className="mt-3 h-4 w-full" />
          </>
        }
      />
    </div>
  );
}

/** No brands at all. This tree's gate does not redirect a brand-less account
 *  away, so the case is reachable and is named rather than left blank - the
 *  same treatment Today and Brand facts give it. */
function NoBrand() {
  return (
    <Frame
      main={
        <div data-testid="v2-learn-no-brand" className="max-w-lg">
          <h1 className="text-metric font-semibold text-vc-primary">Add a brand to start</h1>
          <p className="mt-2 text-body text-vc-secondary">
            There is no brand on this account yet. Adding one opens the guided areas — though Learn
            itself has no lessons written for any brand.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/welcome">Add a brand</Link>
          </Button>
        </div>
      }
      rail={<LearnRail />}
    />
  );
}

export default function LearnPage() {
  const { selectedBrandId, isLoading: brandsLoading } = useBrandSelection();

  if (brandsLoading) return <LoadingLearn />;
  if (!selectedBrandId) return <NoBrand />;

  return (
    <Frame
      main={
        <div data-testid="v2-learn">
          {/* The heading states the state of the area, not an aspiration for
              it. "Learn how citations work" would read as a working screen
              whose list simply had not loaded. */}
          <h1 className="text-metric font-semibold leading-tight text-vc-primary">
            Learn is not ready yet
          </h1>
          <p className="mt-2 max-w-xl text-body text-vc-secondary">
            This area will hold short lessons about how answers get cited and what each kind of
            change is worth. None of them have been written, so there is nothing here to read.
          </p>

          <NotWrittenPanel />

          <p className="mt-6 max-w-xl text-body text-vc-secondary">
            The work itself is unaffected. Every task already carries its own reason and its own
            evidence, and those are on{" "}
            <Link
              to="/v2/my-work"
              className="text-vc-accent underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-vc-accent/40"
            >
              My work
            </Link>{" "}
            today.
          </p>
        </div>
      }
      rail={<LearnRail />}
    />
  );
}
