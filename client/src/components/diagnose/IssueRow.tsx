// client/src/components/diagnose/IssueRow.tsx
//
// One row in the unified issues list. Severity dot + type icon + title +
// subtitle + age + primary CTA. Row click opens IssueDetailSheet or navigates
// per issue.ctaHref. Mirrors Production.tsx row pattern.

import { Link } from "wouter";
import { StatusDot, type StatusDotTone } from "@/components/foundations";
import {
  ChevronRight,
  AlertTriangle,
  Target,
  Bot,
  BarChart3,
  Code,
  Clock,
  BookOpen,
} from "lucide-react";
import type { Issue, IssueType, IssueSeverity } from "@shared/diagnoseTypes";
import { useInspector } from "@/components/AppShell";
import IssueDetailSheet from "./IssueDetailSheet";

const TYPE_ICON: Record<IssueType, typeof AlertTriangle> = {
  hallucination: AlertTriangle,
  listicle_gap: Target,
  wikipedia_gap: BookOpen,
  crawler_block: Bot,
  weak_signal: BarChart3,
  missing_schema: Code,
  stale_article: Clock,
};

const SEVERITY_TONE: Record<IssueSeverity, StatusDotTone> = {
  critical: "warn",
  high: "warn",
  medium: "neutral",
  low: "neutral",
};

function formatAge(iso: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

export default function IssueRow({ issue }: { issue: Issue }) {
  const Icon = TYPE_ICON[issue.type];
  const { open } = useInspector();
  const dot = SEVERITY_TONE[issue.severity];

  if (issue.ctaHref) {
    return (
      <Link href={issue.ctaHref}>
        <a className="w-full py-3 px-2 flex items-center gap-3 text-left transition-colors hover:bg-accent/40 rounded">
          <StatusDot tone={dot} />
          <Icon className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{issue.title}</div>
            <div className="text-xs text-muted-foreground truncate">{issue.subtitle}</div>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{formatAge(issue.age)}</span>
          <span className="text-xs text-primary">{issue.ctaLabel} →</span>
        </a>
      </Link>
    );
  }

  return (
    <button
      onClick={() => open({ title: issue.title, body: <IssueDetailSheet issue={issue} /> })}
      className="w-full py-3 px-2 flex items-center gap-3 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:outline-none rounded"
    >
      <StatusDot tone={dot} />
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{issue.title}</div>
        <div className="text-xs text-muted-foreground truncate">{issue.subtitle}</div>
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{formatAge(issue.age)}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
