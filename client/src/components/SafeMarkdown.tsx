import ReactMarkdown, { type Options } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Pluggable } from "unified";

// Extend the sanitize schema to allow <mark> (the highlight tag inserted
// by createHighlightPlugin). Everything else follows the GitHub schema
// defaults — same security posture, just one extra allowed tag.
const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "mark"],
};

export default function SafeMarkdown(props: Options) {
  const { rehypePlugins, ...rest } = props;
  // Mutable tuple form (NOT `as const`) so the array element matches
  // unified's mutable Pluggable<unknown[]> signature.
  const plugins: Pluggable[] = [
    [rehypeSanitize, schema],
    ...(Array.isArray(rehypePlugins) ? rehypePlugins : []),
  ];
  return <ReactMarkdown {...rest} rehypePlugins={plugins} />;
}
