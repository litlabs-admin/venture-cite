// react-helmet-async APPENDS the tags it manages instead of replacing
// existing markup (see node_modules/react-helmet-async/lib/index.esm.js,
// updateTags()). client/index.html ships a static
// <meta name="description"> for non-JS crawlers (ClaudeBot, GPTBot,
// PerplexityBot, ...), and page components separately set their own
// description via <Helmet>. Because Helmet only ever touches elements it
// stamped with data-rh="true", the static tag and Helmet's tag coexist
// after hydration — two meta[name="description"] elements, with the
// generic marketing copy winning because it comes first in the DOM.
//
// This keeps the static tag untouched in the served HTML (so non-JS
// crawlers and the pre-hydration document still get a description), and
// once Helmet mounts a page-specific description, removes the static
// duplicate so exactly one tag remains. Pages that never set a Helmet
// description (e.g. gated/noindex auth pages) simply keep the static tag
// as their fallback — no regression either way.
export function startStaticMetaDescriptionDedup(): () => void {
  const head = document.head;

  const dedupe = () => {
    const tags = head.querySelectorAll<HTMLMetaElement>('meta[name="description"]');
    if (tags.length < 2) return;
    const helmetManaged = head.querySelector<HTMLMetaElement>(
      'meta[name="description"][data-rh="true"]',
    );
    if (!helmetManaged) return;
    tags.forEach((tag) => {
      if (tag !== helmetManaged) tag.remove();
    });
  };

  dedupe();
  const observer = new MutationObserver(dedupe);
  observer.observe(head, { childList: true });
  return () => observer.disconnect();
}
