// client/src/components/monitor/TrackedPromptsSection.tsx
//
// Collapsed by default — "Show prompts" reveals a list. Each row → Inspector.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useInspector } from "@/components/AppShell";
import PromptInspector from "./inspectors/PromptInspector";

export default function TrackedPromptsSection({ brandId }: { brandId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { open } = useInspector();

  const { data, isLoading } = useQuery({
    queryKey: [`/api/brand-prompts/${brandId}`],
    enabled: !!brandId && expanded,
  });
  const prompts: any[] = (data as any)?.data ?? [];

  function openPrompt(p: any) {
    open({ title: "Tracked prompt", body: <PromptInspector prompt={p} brandId={brandId} /> });
  }

  return (
    <Card>
      <CardHeader>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 flex items-center gap-1"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <CardTitle className="text-base font-medium">
            Tracked prompts{" "}
            {prompts.length > 0 && (
              <span className="text-muted-foreground">({prompts.length})</span>
            )}
          </CardTitle>
        </Button>
      </CardHeader>
      {expanded && (
        <CardContent className="divide-y">
          {isLoading ? (
            <Skeleton className="h-12 my-2" />
          ) : prompts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No tracked prompts yet — add one from <em>Add ▾</em> above.
            </p>
          ) : (
            prompts.map((p) => (
              <button
                key={p.id}
                onClick={() => openPrompt(p)}
                className="w-full py-3 flex items-center justify-between text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="text-sm truncate flex-1 pr-2">{p.prompt}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))
          )}
        </CardContent>
      )}
    </Card>
  );
}
