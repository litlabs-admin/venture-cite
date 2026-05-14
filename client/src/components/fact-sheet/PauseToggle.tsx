import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PauseToggleProps {
  brandId: string;
  enabled: boolean;
  /** Optional notifier so the parent page can disable the Re-scrape button. */
  onChange?: (enabled: boolean) => void;
}

export function PauseToggle({ brandId, enabled, onChange }: PauseToggleProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localEnabled, setLocalEnabled] = useState(enabled);

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      // Server contract (server/routes/factSheet.ts):
      //   PATCH /api/brands/:brandId/fact-scrape-enabled
      //   body:     { enabled: boolean }
      //   response: { success: true, factScrapeEnabled: boolean }
      const res = await apiRequest("PATCH", `/api/brands/${brandId}/fact-scrape-enabled`, {
        enabled: next,
      });
      return (await res.json()) as { success: boolean; factScrapeEnabled: boolean };
    },
    onMutate: (next: boolean) => {
      const previous = localEnabled;
      setLocalEnabled(next);
      onChange?.(next);
      return { previous };
    },
    onError: (err, _next, ctx) => {
      if (ctx) {
        setLocalEnabled(ctx.previous);
        onChange?.(ctx.previous);
      }
      toast({
        variant: "destructive",
        title: "Couldn't update auto-scraping",
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    },
    onSuccess: (data) => {
      toast({
        title: data.factScrapeEnabled ? "Auto-scraping enabled" : "Auto-scraping paused",
        description: data.factScrapeEnabled
          ? "We'll re-check this brand on its monthly schedule."
          : "No automatic or cron scrapes will run for this brand.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      queryClient.invalidateQueries({ queryKey: [`/api/brands/${brandId}`] });
    },
  });

  return (
    <div className="flex items-center gap-2" data-tour-id="fact-sheet.pause-toggle">
      <Switch
        id={`pause-toggle-${brandId}`}
        checked={localEnabled}
        disabled={mutation.isPending}
        onCheckedChange={(checked) => mutation.mutate(checked)}
        data-testid="fact-sheet-pause-toggle"
        aria-label={localEnabled ? "Auto-scraping enabled" : "Auto-scraping paused"}
      />
      <Label htmlFor={`pause-toggle-${brandId}`} className="text-xs text-muted-foreground">
        {localEnabled ? "Auto-scraping enabled" : "Auto-scraping paused"}
      </Label>
    </div>
  );
}
