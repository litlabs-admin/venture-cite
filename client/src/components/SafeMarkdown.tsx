import ReactMarkdown, { type Options } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

export default function SafeMarkdown(props: Options) {
  const { rehypePlugins, ...rest } = props;
  const plugins = [rehypeSanitize, ...(Array.isArray(rehypePlugins) ? rehypePlugins : [])];
  return <ReactMarkdown {...rest} rehypePlugins={plugins} />;
}
