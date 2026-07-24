// Local copies of the exact lucide-react icon paths seen rendered in
// _reference/index.html (chevron-down, arrow-right, menu). The X (close)
// icon isn't present in the static snapshot (mobile menu was never
// captured open) but is lucide's standard "x" glyph, reproduced here since
// it's a generic system icon, not brand-specific content.
import {
  ArrowLeftRight,
  Bot,
  BookOpen,
  Braces,
  Database,
  Eye,
  FlaskConical,
  GitFork,
  Plug,
  Quote,
  Swords,
  Trophy,
  Workflow,
  type LucideIcon,
} from "lucide-react";

type IconProps = { size?: number; className?: string };

const base = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function ChevronDownIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 11, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function MenuIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className}>
      <path d="M4 5h16" />
      <path d="M4 12h16" />
      <path d="M4 19h16" />
    </svg>
  );
}

export function XIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

// The mobile menu's Solutions/Tools rows each render a per-item lucide icon
// (confirmed in nav-data-DcRPnYz_.js) but the tree-shaken export names
// (single/double-letter aliases into a 304KB minified vendor-icons bundle)
// couldn't be resolved to real icon identities. Using a generic dot instead
// of guessing a specific icon. AMBIGUITY — swap in the real icons later.
export function PlaceholderIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      {...base}
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      stroke="none"
    >
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

// Mega-menu item icons. The original site serves illustrated PNGs from
// /menu-icons/<slug>.png; those binaries only ever existed on Trakkr's own
// origin and were never in the archived build, so the port shipped flat
// gray placeholder squares. These lucide glyphs stand in for them — a
// deliberate, visible substitution, not a pixel match. Items that DO have a
// real asset (`iconSrc`) still render it.
const slugIcons: Record<string, LucideIcon> = {
  citations: Quote,
  perception: Eye,
  competitors: Swords,
  workflows: Workflow,
  agent: Bot,
  data: Database,
  research: FlaskConical,
  docs: BookOpen,
  api: Braces,
  mcp: Plug,
  rankings: Trophy,
  "ai-traffic": ArrowLeftRight,
  "query-fanout": GitFork,
};

export function NavItemIcon({
  item,
  size,
  className = "",
}: {
  item: { iconSlug?: string; iconSrc?: string };
  size: number;
  className?: string;
}) {
  if (item.iconSrc) {
    return (
      <img
        src={item.iconSrc}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className={`object-contain flex-shrink-0 ${className}`}
      />
    );
  }
  const Glyph = item.iconSlug ? slugIcons[item.iconSlug] : undefined;
  if (!Glyph) return null;
  return (
    <Glyph
      size={size}
      strokeWidth={1.5}
      aria-hidden="true"
      className={`text-vc-accent flex-shrink-0 ${className}`}
    />
  );
}
