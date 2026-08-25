import { useState } from "react";
import { Highlight, themes } from "prism-react-renderer";
import { ChevronDown, ChevronUp, Copy, FileCode2 } from "lucide-react";

// ─── Fix snippets ────────────────────────────────────────────────────────
// Real, framework-specific code for the checks where "how to fix this" IS a
// specific snippet, not just prose - meta tags, structured data, discovery
// files. This is editorial content (how-to guidance), not a data claim
// about the brand's site, so it's fine to hand-author once per (finding,
// platform) pair - unlike a metric, nothing here is measured FROM the site.
//
// SCOPED, ON PURPOSE: server/lib/platformDetect.ts recognizes ~30 platforms.
// Writing a bespoke, correct snippet for all 30 for every finding would mean
// either a huge surface no one has verified, or thin/wrong snippets padded
// out to look complete. Covering the ones covering the most real sites well
// (Next.js, WordPress) plus one honest framework-agnostic HTML fallback
// beats a shallow snippet for every platform name. Add more platforms here
// as they come up, rather than guessing ahead of need.
export type PlatformKey = "nextjs" | "wordpress" | "generic";

export function platformKey(platform: string | null): PlatformKey {
  if (!platform) return "generic";
  if (platform === "Next.js") return "nextjs";
  if (platform === "WordPress" || platform === "WooCommerce") return "wordpress";
  return "generic";
}

interface Snippet {
  filename: string;
  lang: string;
  code: string;
}

const SNIPPETS: Partial<Record<string, Partial<Record<PlatformKey, Snippet>>>> = {
  "content-meta-tags": {
    nextjs: {
      filename: "app/[page]/page.tsx",
      lang: "tsx",
      code: `// Static pages
export const metadata = {
  title: 'Page Title | Brand Name',
  description: 'A compelling, unique 120-160 character description.',
}

// Dynamic pages
export async function generateMetadata({ params }) {
  const page = await getPage(params.slug)
  return {
    title: page.title,
    description: page.description.slice(0, 160),
  }
}`,
    },
    wordpress: {
      filename: "functions.php (or an SEO plugin)",
      lang: "php",
      code: `// Most WordPress sites should do this through an SEO plugin
// (Yoast, Rank Math) rather than hand-editing the theme - the
// plugin keeps title/description in sync with the editor UI.
// Hand-rolled fallback, if you're not running one:
add_action('wp_head', function () {
  if (is_singular()) {
    global $post;
    $desc = wp_trim_words(strip_tags($post->post_content), 30);
    echo '<meta name="description" content="' . esc_attr($desc) . '">' . "\\n";
  }
}, 1);`,
    },
    generic: {
      filename: "<head>",
      lang: "markup",
      code: `<title>Page Title | Brand Name</title>
<meta name="description" content="A compelling, unique 120-160 character description.">`,
    },
  },
  "content-open-graph": {
    nextjs: {
      filename: "app/[page]/page.tsx",
      lang: "tsx",
      code: `export const metadata = {
  openGraph: {
    title: 'Page Title',
    description: 'Short, shareable description.',
    images: ['/og/page-slug.png'],
  },
}`,
    },
    wordpress: {
      filename: "functions.php (or an SEO plugin)",
      lang: "php",
      code: `// Yoast/Rank Math generate these automatically once a
// Featured Image and SEO description are set on the post.
// Hand-rolled fallback:
add_action('wp_head', function () {
  if (is_singular() && has_post_thumbnail()) {
    echo '<meta property="og:title" content="' . esc_attr(get_the_title()) . '">' . "\\n";
    echo '<meta property="og:image" content="' . esc_url(get_the_post_thumbnail_url()) . '">' . "\\n";
  }
});`,
    },
    generic: {
      filename: "<head>",
      lang: "markup",
      code: `<meta property="og:title" content="Page Title">
<meta property="og:description" content="Short, shareable description.">
<meta property="og:image" content="https://example.com/og/page-slug.png">`,
    },
  },
  "missing-robots-txt": {
    generic: {
      filename: "/robots.txt",
      lang: "text",
      code: `User-agent: *
Allow: /

# AI crawlers
User-agent: GPTBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: PerplexityBot
Allow: /

Sitemap: https://example.com/sitemap.xml`,
    },
  },
  "missing-sitemap-xml": {
    nextjs: {
      filename: "app/sitemap.ts",
      lang: "tsx",
      code: `export default async function sitemap() {
  const pages = await getAllPages()
  return pages.map((page) => ({
    url: \`https://example.com\${page.path}\`,
    lastModified: page.updatedAt,
  }))
}`,
    },
    generic: {
      filename: "/sitemap.xml",
      lang: "markup",
      code: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2026-01-01</lastmod>
  </url>
</urlset>`,
    },
  },
  "missing-llms-txt": {
    generic: {
      filename: "/llms.txt",
      lang: "markdown",
      code: `# Brand Name

> One or two sentences on what this company does.

## Key pages
- [Homepage](https://example.com): what it's for
- [Services](https://example.com/services): what's offered
- [Case studies](https://example.com/case-studies): proof of results`,
    },
  },
  "content-heading-structure": {
    generic: {
      filename: "page markup",
      lang: "markup",
      code: `<h1>One, and only one, per page</h1>
  <h2>A top-level section</h2>
    <h3>A subsection of that section</h3>
  <h2>Another top-level section</h2>
<!-- Don't skip from h1 straight to h3 -->`,
    },
  },
  "content-answer-formats": {
    generic: {
      filename: "page markup",
      lang: "json",
      code: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "What does Brand Name do?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "A direct, quotable answer in 1-2 sentences."
    }
  }]
}
</script>`,
    },
  },
  "content-faq": {
    generic: {
      filename: "page markup",
      lang: "markup",
      code: `<h2>Frequently asked questions</h2>
<h3>What does Brand Name do?</h3>
<p>A direct, quotable answer in 1-2 sentences.</p>

<h3>How much does it cost?</h3>
<p>A direct, quotable answer in 1-2 sentences.</p>`,
    },
  },
  "missing-mcp-json": {
    generic: {
      filename: "/mcp.json",
      lang: "json",
      code: `{
  "name": "brand-name",
  "description": "What this site's tools/actions do",
  "tools": []
}`,
    },
  },
  "missing-security-txt": {
    generic: {
      filename: "/.well-known/security.txt",
      lang: "text",
      code: `Contact: mailto:security@example.com
Expires: 2027-01-01T00:00:00.000Z
Preferred-Languages: en`,
    },
  },
};

export function getFixSnippet(findingId: string, platform: string | null): Snippet | null {
  const byPlatform = SNIPPETS[findingId];
  if (!byPlatform) return null;
  const key = platformKey(platform);
  return byPlatform[key] ?? byPlatform.generic ?? null;
}

export function CodeBlock({ snippet }: { snippet: Snippet }) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(snippet.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="mt-3 overflow-hidden rounded border border-vc-default">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between gap-3 bg-vc-surface px-3 text-left transition-colors hover:bg-vc-muted/40"
      >
        <span className="flex items-center gap-2 text-data text-vc-secondary">
          <FileCode2 className="h-3.5 w-3.5 text-vc-tertiary" aria-hidden />
          {snippet.filename}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-vc-tertiary" aria-hidden />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-vc-tertiary" aria-hidden />
        )}
      </button>
      {open && (
        <div className="relative">
          <button
            type="button"
            onClick={copy}
            className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded bg-black/30 px-1.5 py-1 text-[11px] text-white/80 backdrop-blur transition-colors hover:bg-black/50 hover:text-white"
          >
            <Copy className="h-3 w-3" aria-hidden />
            {copied ? "Copied" : "Copy"}
          </button>
          <Highlight code={snippet.code} language={snippet.lang} theme={themes.vsDark}>
            {({ style, tokens, getLineProps, getTokenProps }) => (
              <pre style={style} className="overflow-x-auto px-3 py-3 text-[12px] leading-relaxed">
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })}>
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        </div>
      )}
    </div>
  );
}
