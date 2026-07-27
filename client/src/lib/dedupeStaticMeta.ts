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

  // React 19 hoists <title>/<meta>/<link> into <head> natively, and it does
  // so WITHOUT any library marker — react-helmet-async's data-rh attribute no
  // longer appears at all, because React gets there first. So identify the
  // static tag explicitly by the data-static-fallback marker in index.html
  // rather than by identifying the framework-managed one.
  const dedupe = () => {
    const staticTag = head.querySelector<HTMLMetaElement>(
      'meta[name="description"][data-static-fallback]',
    );
    if (!staticTag) return;

    // Only drop the fallback once a real page-specific description exists,
    // so pages that set none keep it rather than ending up with nothing.
    // Array.from rather than spread: tsconfig sets no explicit `target`, so
    // NodeList spread trips TS2802 (downlevelIteration).
    const hasPageSpecific = Array.from(
      head.querySelectorAll<HTMLMetaElement>('meta[name="description"]'),
    ).some((tag) => tag !== staticTag);
    if (!hasPageSpecific) return;

    staticTag.remove();
  };

  dedupe();
  const observer = new MutationObserver(dedupe);
  observer.observe(head, { childList: true });
  return () => observer.disconnect();
}
