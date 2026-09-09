import { FileText, Globe, User } from "lucide-react";
import { formatDate } from "../mywork/evidence";
import type { ScannedPage } from "./factRows";

// Where these facts came from, in one list.
//
// The heading says "these facts came from", not "pages we scanned", and the
// difference is load-bearing. This list is DERIVED FROM THE FACTS: a page
// that was visited and produced nothing leaves no fact row and therefore
// cannot appear. Only a scrape run knows about those, and this screen does
// not read one. Titling it as full coverage would overclaim.

function PageIcon({ sourceUrl }: { sourceUrl: string | null }) {
  const Icon = sourceUrl ? (sourceUrl.includes("://") ? Globe : FileText) : User;
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-vc-muted text-vc-secondary"
      aria-hidden="true"
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

export function PagesScanned({ pages }: { pages: readonly ScannedPage[] }) {
  if (pages.length === 0) return null;

  return (
    <section className="mt-10" aria-labelledby="v2-pages-heading" data-testid="v2-pages-scanned">
      <h3
        id="v2-pages-heading"
        className="text-data font-medium tracking-wide text-vc-tertiary uppercase"
      >
        Where these facts came from
      </h3>

      <ul className="mt-3">
        {pages.map((page) => {
          const when = formatDate(page.lastVerified);
          return (
            <li
              key={page.sourceUrl ?? "user-supplied"}
              data-testid="v2-scanned-page"
              className="flex items-center gap-3 border-b border-vc-default py-3 last:border-b-0"
            >
              <PageIcon sourceUrl={page.sourceUrl} />
              <span
                className={`min-w-0 truncate font-mono text-body ${
                  page.sourceUrl ? "text-vc-primary" : "text-vc-secondary"
                }`}
              >
                {page.label}
              </span>
              <span className="shrink-0 text-caption text-vc-secondary">
                {page.factCount} fact{page.factCount === 1 ? "" : "s"} extracted
              </span>
              {when && (
                <span className="ml-auto shrink-0 font-mono text-data text-vc-tertiary">
                  {when}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-caption text-vc-tertiary">
        This list is built from the facts above, so a page that was read and yielded nothing does
        not appear here.
      </p>
    </section>
  );
}
