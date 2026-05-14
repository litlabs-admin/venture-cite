import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getAccessToken } from "@/lib/authStore";

interface CostStatusBadgeProps {
  brandId: string;
}

interface CostStatusResponse {
  factScrapeCents: number;
  monthlyCapCents: number;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CostStatusBadge({ brandId }: CostStatusBadgeProps) {
  const { data, isLoading } = useQuery<CostStatusResponse>({
    queryKey: [`/api/brand-fact-sheet/cost-status`, brandId],
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch(
        `/api/brand-fact-sheet/cost-status?brandId=${encodeURIComponent(brandId)}`,
        {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      if (!res.ok) {
        throw new Error(`cost-status failed: ${res.status}`);
      }
      return (await res.json()) as CostStatusResponse;
    },
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return null;
  }

  const { factScrapeCents, monthlyCapCents } = data;
  const ratio = monthlyCapCents > 0 ? factScrapeCents / monthlyCapCents : 0;

  const tone =
    ratio >= 1 ? "text-destructive" : ratio >= 0.8 ? "text-chart-3" : "text-muted-foreground";

  return (
    <p
      className={cn("text-xs tabular-nums", tone)}
      data-tour-id="fact-sheet.cost-status"
      data-testid="fact-sheet-cost-status"
      aria-label={`${formatDollars(factScrapeCents)} of ${formatDollars(monthlyCapCents)} used this month`}
    >
      {formatDollars(factScrapeCents)} of {formatDollars(monthlyCapCents)} used this month
    </p>
  );
}
