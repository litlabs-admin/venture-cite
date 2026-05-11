import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Circle } from "lucide-react";

// Locked copy for the 4 milestones in the GEO results timeline. Thresholds
// (`minDays`) are inclusive lower bounds on the age of the user's OLDEST
// brand. We pick the highest milestone whose threshold the user has reached.
//
// Order matters here — `currentMilestoneIndex` walks the list low-to-high.
const MILESTONES: Array<{
  label: string;
  description: string;
  minDays: number;
}> = [
  {
    label: "Day 0",
    description: "Set up your brand and run your first visibility check.",
    minDays: 0,
  },
  {
    label: "Week 1",
    description: "Publish your first few pieces of citation-worthy content.",
    minDays: 7,
  },
  {
    label: "Week 2–3",
    description: "First citations show up — AI engines have a 1–2 week lag.",
    minDays: 14,
  },
  {
    label: "Week 4+",
    description: "Rankings stabilize as engines re-index and your authority compounds.",
    minDays: 28,
  },
];

/**
 * Returns the index 0..3 of the current milestone given the brand age.
 * Returns 0 (Day 0) when `daysSinceOldestBrand` is null (no brand yet).
 */
export function currentMilestoneIndex(daysSinceOldestBrand: number | null): number {
  if (daysSinceOldestBrand == null || daysSinceOldestBrand < 0) return 0;
  let idx = 0;
  for (let i = 0; i < MILESTONES.length; i++) {
    if (daysSinceOldestBrand >= MILESTONES[i].minDays) {
      idx = i;
    }
  }
  return idx;
}

interface BrandLite {
  createdAt: string;
}

function oldestBrandAgeDays(brands: BrandLite[] | undefined): number | null {
  if (!brands || brands.length === 0) return null;
  let oldestMs = Number.POSITIVE_INFINITY;
  for (const b of brands) {
    const t = new Date(b.createdAt).getTime();
    if (Number.isFinite(t) && t < oldestMs) oldestMs = t;
  }
  if (!Number.isFinite(oldestMs)) return null;
  const diffMs = Date.now() - oldestMs;
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export default function ResultsTimeline({ compact = false }: { compact?: boolean } = {}) {
  const { data: brandsResp } = useQuery<{
    success: boolean;
    data: BrandLite[];
  }>({ queryKey: ["/api/brands"] });

  const brands = brandsResp?.data;
  const ageDays = oldestBrandAgeDays(brands);
  const currentIdx = currentMilestoneIndex(ageDays);
  const current = MILESTONES[currentIdx];

  if (compact) {
    return (
      <p className="text-xs text-muted-foreground px-1">
        {current.label} — {current.description} First AI citations typically appear 1–2 weeks after
        publish.
      </p>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold mb-4">What to expect</h2>

        <ol className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {MILESTONES.map((m, i) => {
            const done = i < currentIdx;
            const current = i === currentIdx;
            const baseClasses = "rounded-md border p-3 flex flex-col gap-1 transition-colors";
            const stateClasses = current
              ? "border-primary bg-primary/5"
              : done
                ? "border-muted bg-muted/30 text-muted-foreground"
                : "border-border bg-card";
            return (
              <li
                key={m.label}
                className={`${baseClasses} ${stateClasses}`}
                // Tag the current milestone so tests + downstream code can
                // locate it without relying on visual styling.
                data-testid={current ? "current-week" : undefined}
              >
                <div className="flex items-center gap-2">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
                  ) : (
                    <Circle
                      className={"h-4 w-4 " + (current ? "text-primary" : "text-muted-foreground")}
                      aria-hidden="true"
                    />
                  )}
                  <span className={"text-sm font-medium " + (current ? "text-foreground" : "")}>
                    {m.label}
                  </span>
                </div>
                <p className="text-xs leading-snug">{m.description}</p>
              </li>
            );
          })}
        </ol>

        <p className="text-xs text-muted-foreground mt-4">
          AI engines re-index new content on their own schedule &mdash; first citations typically
          appear 1&ndash;2 weeks after a publish.
        </p>
      </CardContent>
    </Card>
  );
}
