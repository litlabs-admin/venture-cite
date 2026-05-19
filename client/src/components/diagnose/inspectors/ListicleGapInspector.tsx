import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Listicle } from "@shared/schema";

// Accept the full listicle row from the server aggregator
// (server/lib/diagnoseIssues.ts puts it in `Issue.metadata.listicle`).
// The legacy `/api/listicles/single/:id` endpoint never existed, so this
// Inspector previously sat at "Loading…" forever.
export default function ListicleGapInspector({
  listicle,
}: {
  listicle: Listicle & {
    // Optional shape extensions tolerated from older callers.
    source?: string | null;
    publisherEmail?: string | null;
  };
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const markContacted = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/listicles/${listicle.id}`, { outreachStatus: "contacted" }),
    onSuccess: () => {
      toast({ title: "Marked as contacted" });
      queryClient.invalidateQueries({ queryKey: ["/api/diagnose/issues"] });
    },
  });

  if (!listicle) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;

  const source = listicle.source ?? listicle.sourcePublication ?? null;

  return (
    <div className="p-4 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Missed citation</p>
        <h2 className="text-lg font-semibold mt-1">{listicle.title}</h2>
        {source && (
          <a
            href={listicle.url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center mt-1"
          >
            {source} <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        )}
      </header>
      <section className="space-y-2">
        <p className="text-sm">
          This listicle doesn&apos;t currently include your brand. Reaching out to the publisher is
          the most direct fix.
        </p>
        {listicle.publisherEmail && (
          <p className="text-sm">
            <strong>Publisher email:</strong> {listicle.publisherEmail}
          </p>
        )}
      </section>
      <footer>
        <Button size="sm" onClick={() => markContacted.mutate()} disabled={markContacted.isPending}>
          Mark as contacted
        </Button>
      </footer>
    </div>
  );
}
