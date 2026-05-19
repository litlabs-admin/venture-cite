import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ListicleGapInspector({ listicleId }: { listicleId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: [`/api/listicles/single/${listicleId}`],
    enabled: !!listicleId,
  });
  const listicle = (data as any)?.data;

  const markContacted = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/listicles/${listicleId}`, { outreachStatus: "contacted" }),
    onSuccess: () => {
      toast({ title: "Marked as contacted" });
      queryClient.invalidateQueries({ queryKey: ["/api/diagnose/issues"] });
    },
  });

  if (!listicle) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="p-4 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Missed citation</p>
        <h2 className="text-lg font-semibold mt-1">{listicle.title}</h2>
        {listicle.source && (
          <a
            href={listicle.url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center mt-1"
          >
            {listicle.source} <ExternalLink className="h-3 w-3 ml-1" />
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
