// client/src/components/monitor/ByEngineSection.tsx
//
// One row per AI engine. Click row → EngineInspector.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";
import { useInspector } from "@/components/AppShell";
import EngineInspector from "./inspectors/EngineInspector";

type PlatformRow = {
  aiPlatform: string;
  citedCount: number;
  totalCount: number;
  rank: number | null;
  latestSnippet?: string | null;
};

export default function ByEngineSection({
  brandId,
  platforms,
  isLoading,
}: {
  brandId: string;
  platforms: PlatformRow[];
  isLoading: boolean;
}) {
  const { open } = useInspector();

  function openEngine(engineName: string) {
    open({
      title: engineName,
      body: <EngineInspector brandId={brandId} engineName={engineName} />,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>By engine</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 my-2" />)
          : platforms.map((p) => (
              <button
                key={p.aiPlatform}
                onClick={() => openEngine(p.aiPlatform)}
                className="w-full py-3 flex items-center justify-between text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:outline-none"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium">{p.aiPlatform}</div>
                  <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                    {p.citedCount}/{p.totalCount} cited · avg rank {p.rank ?? "—"}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
      </CardContent>
    </Card>
  );
}
