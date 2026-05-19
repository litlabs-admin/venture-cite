// client/src/components/diagnose/DiagnoseRunCheck.tsx
//
// Adaptive "Run check ▾" — kicks off the diagnostic scans. Each option
// fires an existing or new endpoint. No "Hallucination scan" — those run as
// part of a citation run from /monitor.

import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DiagnoseRunCheck({ brandId }: { brandId: string }) {
  const { toast } = useToast();

  const listicleScan = useMutation({
    mutationFn: () => apiRequest("POST", `/api/listicles/discover/${brandId}`, {}),
    onSuccess: () => {
      toast({ title: "Listicle scan started" });
      queryClient.invalidateQueries({ queryKey: [`/api/diagnose/issues/${brandId}`] });
    },
    onError: () => toast({ title: "Could not start listicle scan", variant: "destructive" }),
  });

  const wikipediaScan = useMutation({
    mutationFn: () => apiRequest("POST", `/api/wikipedia/scan/${brandId}`, {}),
    onSuccess: () => {
      toast({ title: "Wikipedia scan started" });
      queryClient.invalidateQueries({ queryKey: [`/api/diagnose/issues/${brandId}`] });
    },
    onError: () => toast({ title: "Could not start Wikipedia scan", variant: "destructive" }),
  });

  // E.6.5 endpoints — these will 404 until the server-side automation
  // increment lands. The toast will surface that honestly.
  const crawlerScan = useMutation({
    mutationFn: () => apiRequest("POST", `/api/diagnose/crawler-scan/${brandId}`, {}),
    onSuccess: () => {
      toast({ title: "Crawler check started" });
      queryClient.invalidateQueries({ queryKey: [`/api/diagnose/issues/${brandId}`] });
    },
    onError: () => toast({ title: "Could not start crawler check", variant: "destructive" }),
  });

  const signalsRescore = useMutation({
    mutationFn: () => apiRequest("POST", `/api/diagnose/signals-rescore/${brandId}`, {}),
    onSuccess: () => {
      toast({ title: "Signals re-score started" });
      queryClient.invalidateQueries({ queryKey: [`/api/diagnose/issues/${brandId}`] });
    },
    onError: () => toast({ title: "Could not start signals re-score", variant: "destructive" }),
  });

  const schemaAudit = useMutation({
    mutationFn: () => apiRequest("POST", `/api/diagnose/schema-audit/${brandId}`, {}),
    onSuccess: () => {
      toast({ title: "Schema audit started" });
      queryClient.invalidateQueries({ queryKey: [`/api/diagnose/issues/${brandId}`] });
    },
    onError: () => toast({ title: "Could not start schema audit", variant: "destructive" }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-testid="diagnose-run-check">
          <Play className="h-4 w-4 mr-1" />
          Run check
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => listicleScan.mutate()} disabled={listicleScan.isPending}>
          Listicle scan
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => wikipediaScan.mutate()}
          disabled={wikipediaScan.isPending}
        >
          Wikipedia scan
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => crawlerScan.mutate()} disabled={crawlerScan.isPending}>
          Crawler check
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => signalsRescore.mutate()}
          disabled={signalsRescore.isPending}
        >
          Signals re-score
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => schemaAudit.mutate()} disabled={schemaAudit.isPending}>
          Schema audit
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
