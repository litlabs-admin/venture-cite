// client/src/components/diagnose/DiagnoseIssues.tsx
//
// The /diagnose canvas. One unified worklist of mixed-type issues with
// stat-row chips, filter dropdowns, and the adaptive Run check ▾.
// Literal mirror of /act's Production canvas.

import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Brain, ListChecks } from "lucide-react";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import IssueStats from "./IssueStats";
import IssueRow from "./IssueRow";
import DiagnoseRunCheck from "./DiagnoseRunCheck";
import type { IssueType, IssueSeverity, IssueStatus, IssuesResponse } from "@shared/diagnoseTypes";

export default function DiagnoseIssues() {
  const { selectedBrandId, brands, isLoading: brandsLoading } = useBrandSelection();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);

  const initialType = (params.get("type") as IssueType | null) ?? null;
  const [typeFilter, setTypeFilter] = useState<IssueType | "all">(initialType ?? "all");
  const [severityFilter, setSeverityFilter] = useState<IssueSeverity | "all">("all");
  const [statusFilter, setStatusFilter] = useState<IssueStatus | "all">("open");

  // Legacy ?tab=* → ?type=* translation (one-shot on mount)
  useEffect(() => {
    const tab = params.get("tab");
    if (tab && !params.get("type")) {
      const map: Record<string, IssueType> = {
        hallucinations: "hallucination",
        coverage: "listicle_gap",
        signals: "weak_signal",
        crawler: "crawler_block",
      };
      const next = map[tab];
      if (next) {
        const sp = new URLSearchParams(searchString);
        sp.delete("tab");
        sp.set("type", next);
        setLocation(`/diagnose?${sp.toString()}`, { replace: true });
        setTypeFilter(next);
      }
    }
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading } = useQuery<IssuesResponse>({
    queryKey: [`/api/diagnose/issues/${selectedBrandId}`],
    enabled: !!selectedBrandId,
  });

  const stats = data?.data.stats;
  const items = data?.data.items ?? [];

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (typeFilter !== "all" && i.type !== typeFilter) return false;
      if (severityFilter !== "all" && i.severity !== severityFilter) return false;
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      return true;
    });
  }, [items, typeFilter, severityFilter, statusFilter]);

  if (brandsLoading) return <Skeleton className="h-64 w-full" />;
  if (brands.length === 0) {
    return (
      <EmptyState
        icon={Brain}
        title="Create a brand to get started"
        action={{ label: "Create brand", href: "/setup?tab=brands", onClick: () => {} }}
        description="Diagnose surfaces issues across hallucinations, citations, crawlers, and content signals once you have a brand."
      />
    );
  }
  if (!selectedBrandId) {
    return (
      <EmptyState
        icon={Brain}
        title="Select a brand"
        description="Pick a brand to see its issues."
      />
    );
  }

  function toggleTypeChip(t: IssueType) {
    setTypeFilter((current) => (current === t ? "all" : t));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <DiagnoseRunCheck brandId={selectedBrandId} />
      </div>

      {stats && (
        <IssueStats
          stats={stats}
          activeFilter={typeFilter === "all" ? null : (typeFilter as IssueType)}
          onToggle={toggleTypeChip}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as IssueType | "all")}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="hallucination">Hallucinations</SelectItem>
            <SelectItem value="listicle_gap">Missed citations</SelectItem>
            <SelectItem value="wikipedia_gap">Wikipedia gaps</SelectItem>
            <SelectItem value="crawler_block">Crawlers blocked</SelectItem>
            <SelectItem value="weak_signal">Weak signals</SelectItem>
            <SelectItem value="missing_schema">Missing schema</SelectItem>
            <SelectItem value="stale_article">Stale articles</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={severityFilter}
          onValueChange={(v) => setSeverityFilter(v as IssueSeverity | "all")}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as IssueStatus | "all")}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Open" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nothing to fix right now"
          description="When new hallucinations, citation gaps, or weak signals appear, they'll show up here."
        />
      ) : (
        <div className="divide-y rounded border border-border">
          {filtered.map((i) => (
            <IssueRow key={i.id} issue={i} />
          ))}
        </div>
      )}
    </div>
  );
}
