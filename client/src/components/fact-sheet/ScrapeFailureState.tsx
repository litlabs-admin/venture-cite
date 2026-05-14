// Spec 2 §4.7 — eight failure-state branches.
// Mapping: seven explicit error_kind cases + an "unknown" fallback.
// NOTE: The eighth row in Spec 2 §4.7 ("Mixed — some pages worked") is rendered
// by the per-page panel + diff view, NOT here. This component only handles
// terminal-failure runs.
import { Link } from "wouter";
import {
  AlertTriangle,
  Ban,
  Clock,
  CloudOff,
  DollarSign,
  ExternalLink,
  FileText,
  ServerCrash,
  ShieldOff,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type ScrapeFailureKind =
  | "all_pages_4xx"
  | "spa_empty"
  | "blocked"
  | "robots_disallowed"
  | "llm_unavailable"
  | "cost_cap_reached"
  | "timeout"
  | "fetch_failed"
  | "mixed_failures"
  | "unknown";

interface ScrapeFailureStateProps {
  errorKind: ScrapeFailureKind | string | null;
  errorMessage?: string | null;
  runId: string;
  brandId: string;
  brandWebsite?: string | null;
}

function hostOf(url: string | null | undefined): string {
  if (!url) return "your website";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function ScrapeFailureState({
  errorKind,
  errorMessage,
  runId,
  brandId,
  brandWebsite,
}: ScrapeFailureStateProps) {
  const host = hostOf(brandWebsite);

  switch (errorKind) {
    case "all_pages_4xx":
      return (
        <Alert
          variant="destructive"
          data-tour-id="fact-sheet.failure-state"
          data-testid={`scrape-failure-${errorKind}`}
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>We couldn't find pages to read on {host}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>Every URL we tried returned a 4xx error. Did you spell the website URL right?</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/brands?edit=${brandId}`}>
                  Edit brand URL <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/brands?edit=${brandId}`}>Or edit your brand description</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      );

    case "spa_empty":
      return (
        <Alert data-tour-id="fact-sheet.failure-state" data-testid={`scrape-failure-${errorKind}`}>
          <CloudOff className="h-4 w-4" />
          <AlertTitle>{host} looks like a JavaScript-only app</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              We couldn't see real content without rendering JavaScript. We don't run a headless
              browser yet — but you can paste a description of your brand below and we'll use that
              instead.
            </p>
            <Button asChild size="sm" data-testid="scrape-failure-spa-add-fact">
              <Link href={`/brands?edit=${brandId}`}>Edit your brand description</Link>
            </Button>
          </AlertDescription>
        </Alert>
      );

    case "blocked":
      return (
        <Alert
          variant="destructive"
          data-tour-id="fact-sheet.failure-state"
          data-testid={`scrape-failure-${errorKind}`}
        >
          <ShieldOff className="h-4 w-4" />
          <AlertTitle>{host} blocked our scanner</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Looks like a CDN (Cloudflare / Akamai) is filtering our crawler. To allow it, add this
              line to your <code className="rounded bg-muted px-1 py-0.5">robots.txt</code>:
            </p>
            <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
              User-agent: VentureCiteBot/1.0{"\n"}Allow: /
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/brands?edit=${brandId}`}>
                  Edit brand <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/brands?edit=${brandId}`}>Or edit your brand description</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      );

    case "robots_disallowed":
      return (
        <Alert data-tour-id="fact-sheet.failure-state" data-testid={`scrape-failure-${errorKind}`}>
          <Ban className="h-4 w-4" />
          <AlertTitle>Your robots.txt blocks bots</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              We respect <code className="rounded bg-muted px-1 py-0.5">Disallow</code> rules in
              your robots.txt. Add facts manually below — or remove the rule for
              <code className="ml-1 rounded bg-muted px-1 py-0.5">VentureCiteBot/1.0</code>.
            </p>
            <Button asChild size="sm" data-testid="scrape-failure-robots-add-fact">
              <Link href={`/brands?edit=${brandId}`}>Edit your brand description</Link>
            </Button>
          </AlertDescription>
        </Alert>
      );

    case "llm_unavailable":
      return (
        <Alert data-tour-id="fact-sheet.failure-state" data-testid={`scrape-failure-${errorKind}`}>
          <ServerCrash className="h-4 w-4" />
          <AlertTitle>Our AI provider is having issues</AlertTitle>
          <AlertDescription>
            <p>
              We've been notified and your scrape will retry automatically within a few minutes. No
              action needed on your end.
            </p>
            {errorMessage ? (
              <p className="mt-2 text-xs text-muted-foreground">Details: {errorMessage}</p>
            ) : null}
          </AlertDescription>
        </Alert>
      );

    case "cost_cap_reached":
      return (
        <Alert data-tour-id="fact-sheet.failure-state" data-testid={`scrape-failure-${errorKind}`}>
          <DollarSign className="h-4 w-4" />
          <AlertTitle>You've used your monthly fact-scrape budget</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              The default cap is $5.00 per month. It resets on day 1 of next month. Existing facts
              continue to work — only re-scrapes are paused.
            </p>
            <p className="text-xs text-muted-foreground">
              Need more headroom? Email support and we'll raise it.
            </p>
          </AlertDescription>
        </Alert>
      );

    case "timeout":
      return (
        <Alert data-tour-id="fact-sheet.failure-state" data-testid={`scrape-failure-${errorKind}`}>
          <Clock className="h-4 w-4" />
          <AlertTitle>This scrape ran past the 5-minute limit</AlertTitle>
          <AlertDescription>
            <p>
              We saved whatever partial results we got below. Try re-running tomorrow — if this
              keeps happening, your site may be very large or slow to respond.
            </p>
          </AlertDescription>
        </Alert>
      );

    case "fetch_failed":
      return (
        <Alert
          variant="destructive"
          data-tour-id="fact-sheet.failure-state"
          data-testid={`scrape-failure-${errorKind}`}
        >
          <CloudOff className="h-4 w-4" />
          <AlertTitle>We couldn't reach {host}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Every connection attempt failed — TLS handshake, DNS, or the site is blocking
              automated traffic. Double-check the URL is correct and reachable from the public
              internet.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/brands?edit=${brandId}`}>
                  Edit brand URL <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      );

    case "mixed_failures":
      return (
        <Alert
          variant="destructive"
          data-tour-id="fact-sheet.failure-state"
          data-testid={`scrape-failure-${errorKind}`}
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>None of the pages we tried worked</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              The pages we picked returned a mix of errors — some 404, some timed out, some blocked.
              This usually means the URL list we generated doesn't match your site's real structure.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/brands?edit=${brandId}`}>
                  Edit brand description <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
            {errorMessage ? (
              <p className="text-xs text-muted-foreground">Details: {errorMessage}</p>
            ) : null}
          </AlertDescription>
        </Alert>
      );

    default:
      return (
        <Alert
          variant="destructive"
          data-tour-id="fact-sheet.failure-state"
          data-testid="scrape-failure-unknown"
        >
          <FileText className="h-4 w-4" />
          <AlertTitle>Scrape failed</AlertTitle>
          <AlertDescription>
            <p>
              Something went wrong while reading {host}. Try re-scraping — if it keeps failing,
              contact support with run ID{" "}
              <code className="rounded bg-muted px-1 py-0.5">{runId}</code>.
            </p>
            {errorMessage ? (
              <p className="mt-2 text-xs text-muted-foreground">Details: {errorMessage}</p>
            ) : null}
          </AlertDescription>
        </Alert>
      );
  }
}
