// spec §3.12.D + §3.12.H — horizontal filter bar for the Mentions table.
// Mobile (<sm): collapses into a "Filters (N)" button that opens a Sheet.
// Desktop (>=sm): 6 controls in a horizontal row.

import { useEffect, useRef, useState } from "react";
import { Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MentionsFiltersState = {
  status?: string;
  platform?: string;
  sentiment?: string;
  from?: string;
  to?: string;
  q?: string;
  sort?: string;
  newSinceLastScan?: boolean;
};

type MentionsFiltersProps = {
  filters: MentionsFiltersState;
  onChange: (key: string, value: string | undefined | boolean) => void;
  onClear: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countActiveFilters(filters: MentionsFiltersState): number {
  let count = 0;
  if (filters.status && filters.status !== "all") count++;
  if (filters.platform && filters.platform !== "all") count++;
  if (filters.sentiment && filters.sentiment !== "all") count++;
  if (filters.from) count++;
  if (filters.to) count++;
  if (filters.q) count++;
  if (filters.sort && filters.sort !== "newest") count++;
  if (filters.newSinceLastScan) count++;
  return count;
}

// ---------------------------------------------------------------------------
// Sub-components: the 6 filter controls (reused in both desktop row + Sheet)
// ---------------------------------------------------------------------------

interface FilterControlsProps {
  filters: MentionsFiltersState;
  onChange: (key: string, value: string | undefined | boolean) => void;
  /** When true, renders controls stacked vertically (Sheet layout). */
  stacked?: boolean;
}

function FilterControls({ filters, onChange, stacked = false }: FilterControlsProps) {
  // Local state for the debounced search input — keeps the text field
  // responsive while the actual onChange fires 300 ms after the user stops.
  const [searchDraft, setSearchDraft] = useState(filters.q ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep draft in sync if parent clears filters.
  useEffect(() => {
    setSearchDraft(filters.q ?? "");
  }, [filters.q]);

  function handleSearchChange(value: string) {
    setSearchDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange("q", value || undefined);
    }, 300);
  }

  const wrapCls = stacked ? "flex flex-col gap-3" : "flex flex-wrap items-center gap-2";
  const labelCls = "text-xs text-muted-foreground font-medium mb-0.5";
  const fieldWrapCls = stacked ? "flex flex-col" : "";

  return (
    <div className={wrapCls}>
      {/* 1. Status */}
      <div className={fieldWrapCls}>
        {stacked && <span className={labelCls}>Status</span>}
        <Select
          value={filters.status ?? "all"}
          onValueChange={(v) => onChange("status", v === "all" ? undefined : v)}
        >
          <SelectTrigger
            className={cn("h-8 text-xs", stacked ? "w-full" : "w-[150px]")}
            aria-label="Filter by status"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="replied">Replied</SelectItem>
            <SelectItem value="false_positive">False positive</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 2. Platform */}
      <div className={fieldWrapCls}>
        {stacked && <span className={labelCls}>Platform</span>}
        <Select
          value={filters.platform ?? "all"}
          onValueChange={(v) => onChange("platform", v === "all" ? undefined : v)}
        >
          <SelectTrigger
            className={cn("h-8 text-xs", stacked ? "w-full" : "w-[140px]")}
            aria-label="Filter by platform"
          >
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="reddit">Reddit</SelectItem>
            <SelectItem value="hackernews">Hacker News</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 3. Sentiment */}
      <div className={fieldWrapCls}>
        {stacked && <span className={labelCls}>Sentiment</span>}
        <Select
          value={filters.sentiment ?? "all"}
          onValueChange={(v) => onChange("sentiment", v === "all" ? undefined : v)}
        >
          <SelectTrigger
            className={cn("h-8 text-xs", stacked ? "w-full" : "w-[130px]")}
            aria-label="Filter by sentiment"
          >
            <SelectValue placeholder="Sentiment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sentiments</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 4. Date range */}
      <div className={cn(fieldWrapCls, stacked ? "" : "flex items-center gap-1")}>
        {stacked && <span className={labelCls}>Date range</span>}
        <div className={cn("flex items-center gap-1", stacked ? "" : "")}>
          <Input
            type="date"
            className="h-8 text-xs w-[130px]"
            value={filters.from ?? ""}
            onChange={(e) => onChange("from", e.target.value || undefined)}
            aria-label="From date"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="date"
            className="h-8 text-xs w-[130px]"
            value={filters.to ?? ""}
            onChange={(e) => onChange("to", e.target.value || undefined)}
            aria-label="To date"
          />
        </div>
      </div>

      {/* 5. Free-text search */}
      <div className={cn(fieldWrapCls, stacked ? "" : "relative")}>
        {stacked && <span className={labelCls}>Search</span>}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search mentions…"
            className={cn("h-8 text-xs pl-7", stacked ? "w-full" : "w-[180px]")}
            value={searchDraft}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Search mentions"
          />
        </div>
      </div>

      {/* 6. Sort */}
      <div className={fieldWrapCls}>
        {stacked && <span className={labelCls}>Sort by</span>}
        <Select
          value={filters.sort ?? "newest"}
          onValueChange={(v) => onChange("sort", v === "newest" ? undefined : v)}
        >
          <SelectTrigger
            className={cn("h-8 text-xs", stacked ? "w-full" : "w-[130px]")}
            aria-label="Sort mentions"
          >
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="engagement">Most engagement</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function MentionsFilters({ filters, onChange, onClear }: MentionsFiltersProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeCount = countActiveFilters(filters);
  const hasActiveFilters = activeCount > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* ------------------------------------------------------------------ */}
      {/* Row: chip + mobile toggle + (desktop) filter controls + clear btn   */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-2">
        {/* "New since last scan" chip — always visible */}
        <button
          type="button"
          onClick={() => onChange("newSinceLastScan", !filters.newSinceLastScan)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            filters.newSinceLastScan
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background text-foreground hover:bg-accent",
          )}
          aria-pressed={!!filters.newSinceLastScan}
        >
          {filters.newSinceLastScan && <X className="h-3 w-3" />}
          New since last scan
        </button>

        {/* Mobile: "Filters (N)" button — hidden at sm+ */}
        <div className="flex items-center gap-2 sm:hidden">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setSheetOpen(true)}
            aria-label={`Open filters, ${activeCount} active`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeCount > 0 && (
              <Badge className="ml-0.5 h-4 min-w-4 rounded-full px-1 text-[10px] leading-none">
                {activeCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Desktop: full filter controls — hidden below sm */}
        <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">
          <FilterControls filters={filters} onChange={onChange} />
          {/* Active-filter count badge (desktop) */}
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-6 rounded-full text-xs">
              <Filter className="mr-1 h-3 w-3" />
              {activeCount} active
            </Badge>
          )}
        </div>

        {/* Clear button — always visible when filters are active */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={onClear}
            aria-label="Clear all filters"
          >
            <X className="mr-1 h-3 w-3" />
            Clear filters
          </Button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile Sheet — opens on small screens                               */}
      {/* ------------------------------------------------------------------ */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[300px] sm:max-w-[300px]">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeCount > 0 && (
                <Badge className="ml-1 h-5 rounded-full px-1.5 text-xs">{activeCount}</Badge>
              )}
            </SheetTitle>
          </SheetHeader>
          <FilterControls filters={filters} onChange={onChange} stacked />
          {hasActiveFilters && (
            <div className="mt-6">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  onClear();
                  setSheetOpen(false);
                }}
              >
                <X className="mr-1 h-3 w-3" />
                Clear all filters
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
