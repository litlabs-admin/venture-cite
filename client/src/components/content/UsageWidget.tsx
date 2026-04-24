import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <Card className="mt-4 bg-card border border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-2 h-2 rounded-full ${
                data.articlesRemaining === 0
                  ? "bg-red-500"
                  : data.articlesRemaining <= 5
                    ? "bg-yellow-500"
                    : "bg-green-500"
              }`}
            />
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{data.articlesUsed}</span>
              {" / "}
              <span>{data.articlesLimit === -1 ? "Unlimited" : data.articlesLimit}</span>
              {" articles this month"}
            </span>
            <span className="text-xs text-muted-foreground capitalize px-2 py-0.5 bg-muted rounded">
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
              <Link href="/pricing">
                <Button size="sm" variant="default" className="bg-primary hover:bg-primary/90">
                  Upgrade Plan
                </Button>
              </Link>
            )}
            {data.articlesRemaining > 0 &&
              data.articlesRemaining <= 5 &&
              data.articlesLimit !== -1 && (
                <span className="text-xs text-yellow-500 font-medium">
                  {data.articlesRemaining} remaining
                </span>
              )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
