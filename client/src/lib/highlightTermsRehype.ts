import type { Plugin } from "unified";
import type { Root, Element, Text } from "hast";
import { visit, SKIP } from "unist-util-visit";

const TERMS_CAP = 50;

/** Returns a rehype plugin that walks hast text nodes and wraps
 *  case-insensitive, word-boundary matches in <mark>. Skips text
 *  inside <code>, <pre>, or <a> elements (matches inside links or
 *  code blocks would corrupt the rendered output). Pure function —
 *  factory pattern lets the same instance be reused across renders. */
export function createHighlightPlugin(terms: string[]): Plugin<[], Root> {
  // Cap term count to bound regex compile cost. Real brands have <10
  // variations; the cap protects against pathological config.
  const cappedTerms = terms.slice(0, TERMS_CAP).filter((t) => t && t.trim().length > 0);

  if (cappedTerms.length === 0) {
    // No-op plugin — return early so the default plugin shape is preserved.
    return () => () => {};
  }

  // Sort longest-first so "Stripe Inc" matches before "Stripe" when both
  // are in the term list. RegExp alternation is greedy left-to-right —
  // longest-first is the simplest way to prefer the longer match.
  const sorted = [...cappedTerms].sort((a, b) => b.length - a.length);

  // Escape regex special chars in each term so brand names like "C++" or
  // "AT&T" don't break the pattern.
  const escaped = sorted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  // Use lookarounds rather than \b because \b doesn't transition correctly
  // around non-word characters. Example: \b doesn't match between "+" and " "
  // in "C++ programming", so "C++" wouldn't be highlighted. The lookaround
  // form requires the match to NOT be preceded/followed by a word char,
  // which gives correct behavior for both "Stripe" (no match in "stripeling")
  // and "C++" (match in "C++ programming"). Case-insensitive via the i flag.
  // Global flag so all occurrences in a node get wrapped, not just the first.
  const pattern = new RegExp(`(?<![A-Za-z0-9_])(${escaped.join("|")})(?![A-Za-z0-9_])`, "gi");

  return () => (tree) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined || index === null) return;

      // Skip text inside elements where highlighting would corrupt
      // semantics: <code>, <pre>, <a>. Walk up the parent chain isn't
      // available in unist-util-visit's signature directly — we rely
      // on the immediate parent being one of these (rehype trees from
      // markdown have flat text-in-element structure, no nested
      // text-in-text). For safety, also skip if parent's tagName is one
      // of the known opt-out tags.
      if (parent.type === "element") {
        const tag = (parent as Element).tagName;
        if (tag === "code" || tag === "pre" || tag === "a") return;
      }

      // Skip if the text doesn't contain any matches — common case.
      if (!pattern.test(node.value)) {
        pattern.lastIndex = 0; // reset stateful regex
        return;
      }
      pattern.lastIndex = 0;

      // Split the text into alternating non-match / match segments and
      // build a new array of nodes. text -> [text, mark, text, mark, …].
      const newNodes: Array<Text | Element> = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(node.value)) !== null) {
        if (match.index > lastIndex) {
          newNodes.push({ type: "text", value: node.value.slice(lastIndex, match.index) });
        }
        newNodes.push({
          type: "element",
          tagName: "mark",
          properties: {},
          children: [{ type: "text", value: match[0] }],
        });
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < node.value.length) {
        newNodes.push({ type: "text", value: node.value.slice(lastIndex) });
      }

      // Replace the original text node with the new sequence in the parent.
      (parent as Element).children.splice(index, 1, ...newNodes);
      // Skip the inserted nodes so visit() doesn't re-process them.
      return [SKIP, index + newNodes.length];
    });
  };
}
