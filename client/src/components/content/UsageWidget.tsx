import { Progress } from "@/components/ui/progress";

interface UsageWidgetProps {
  data: {
    articlesUsed: number;
    articlesLimit: number;
    articlesRemaining: number;
    brandsUsed: number;
    brandsLimit: number;
    brandsRemaining: number;
    resetDate: string | null;
    tier: string;
  };
}

export default function UsageWidget({ data }: UsageWidgetProps) {
  return (
    <div className="mt-4 border-t border-vc-default pt-4">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${
              data.articlesRemaining === 0
                ? "bg-destructive"
                : data.articlesRemaining <= 5
                  ? "bg-warning"
                  : "bg-positive"
            }`}
          />
          <span className="text-caption text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{data.articlesUsed}</span>
            {" / "}
            <span className="tabular-nums">
              {data.articlesLimit === -1 ? "Unlimited" : data.articlesLimit}
            </span>
            {" articles this month"}
          </span>
          <span className="text-caption text-muted-foreground capitalize px-2 py-0.5 bg-vc-muted rounded">
            {data.tier} Plan
          </span>
        </div>
        <div className="flex items-center gap-4">
          {data.articlesLimit !== -1 && (
            <div className="w-32">
              <Progress value={(data.articlesUsed / data.articlesLimit) * 100} className="h-2" />
            </div>
          )}
          {data.articlesRemaining === 0 && (
            <span className="text-caption text-destructive font-medium">Monthly limit reached</span>
          )}
          {data.articlesRemaining > 0 &&
            data.articlesRemaining <= 5 &&
            data.articlesLimit !== -1 && (
              <span className="text-caption text-warning font-medium">
                {data.articlesRemaining} remaining
              </span>
            )}
        </div>
      </div>
    </div>
  );
}
