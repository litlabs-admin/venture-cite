import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, ChevronDown, MessageSquare, Swords, Radar, Play } from "lucide-react";
import { AddMentionDialog } from "@/components/geo-tools/AddMentionDialog";

// ─── MonitorAdd ──────────────────────────────────────────────────────────────
// Visibility canvas's adaptive "Add ▾" entry point. Mirrors /act's Production
// "New ▾" pattern: one button, four creation paths that live next to where
// you'd look at the data. Tracked prompts + competitors + manual mentions are
// the three writeable inputs to the visibility pipeline; "Run citation check"
// kicks off the same async run the Citations page does. All four invalidate
// the same query keys the existing pages use so the canvas refreshes itself.

type Mode = "closed" | "prompt" | "competitor" | "mention";

export default function MonitorAdd({ brandId }: { brandId: string }) {
  const [mode, setMode] = useState<Mode>("closed");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Run citation check — same kickoff Citations uses. The server side is
  // async (returns ~100ms with runId, 409 if one's already in flight); the
  // banner / live-progress wiring lives in the canvas itself, so here we
  // just confirm the run started and let the active-runs gate take over.
  const runMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/brand-prompts/${brandId}/run`, {});
      return { status: r.status, body: await r.json() };
    },
    onSuccess: ({ status, body }) => {
      if (status === 409 && body?.error === "already_running") {
        toast({
          title: "Run already in progress",
          description: "Watching live progress for the existing run.",
        });
      } else if (body?.success) {
        toast({ title: "Citation run started" });
      } else {
        toast({
          title: "Could not start run",
          description: body?.error || "Please try again.",
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["/api/brands", brandId, "citation-runs/active"],
      });
    },
    onError: (err: Error) =>
      toast({
        title: "Could not start run",
        description: err.message,
        variant: "destructive",
      }),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button data-testid="visibility-add" data-tour-id="prompts.runButton">
            <Plus className="h-4 w-4 mr-1" />
            Add
            <ChevronDown className="h-4 w-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMode("prompt")}>
            <MessageSquare className="h-4 w-4 mr-2" /> Tracked prompt
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMode("competitor")}>
            <Swords className="h-4 w-4 mr-2" /> Competitor
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMode("mention")}>
            <Radar className="h-4 w-4 mr-2" /> Manual mention
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => runMutation.mutate()} disabled={runMutation.isPending}>
            <Play className="h-4 w-4 mr-2" /> Run citation check
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mode === "prompt"} onOpenChange={(o) => !o && setMode("closed")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add tracked prompt</DialogTitle>
          </DialogHeader>
          <AddPromptForm brandId={brandId} onDone={() => setMode("closed")} />
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "competitor"} onOpenChange={(o) => !o && setMode("closed")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add competitor</DialogTitle>
          </DialogHeader>
          <AddCompetitorForm brandId={brandId} onDone={() => setMode("closed")} />
        </DialogContent>
      </Dialog>

      {/* AddMentionDialog already manages its own form / submit state — we
          just hand it the brand + an async submit that hits the same
          /api/brand-mentions endpoint useMentions.manualAdd uses. Mirrors
          MentionsTab's exact wiring. */}
      <AddMentionDialog
        brandId={brandId}
        open={mode === "mention"}
        onOpenChange={(o) => !o && setMode("closed")}
        onSubmit={async ({ platform, sourceUrl }) => {
          await apiRequest("POST", "/api/brand-mentions", {
            brandId,
            platform,
            sourceUrl,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/brand-mentions"] });
          toast({ title: "Mention added" });
        }}
      />
    </>
  );
}

// Inline prompt-add form. The server currently grows the tracked set via
// suggestions/accept — this calls the documented inline endpoint and lets
// the API surface the error if it's not yet wired. Invalidates the same
// query key Citations uses so the prompt list refreshes wherever it's open.
function AddPromptForm({ brandId, onDone }: { brandId: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => apiRequest("POST", `/api/brand-prompts`, { brandId, prompt: text.trim() }),
    onSuccess: () => {
      toast({ title: "Prompt added" });
      queryClient.invalidateQueries({
        queryKey: [`/api/brand-prompts/${brandId}`],
      });
      setText("");
      onDone();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not add prompt",
        description: err.message,
        variant: "destructive",
      }),
  });
  return (
    <div className="space-y-3">
      <Label htmlFor="monitor-add-prompt">Prompt</Label>
      <Input
        id="monitor-add-prompt"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Best CRM for early-stage startups?"
        data-testid="monitor-add-prompt-input"
      />
      <Button
        onClick={() => create.mutate()}
        disabled={!text.trim() || create.isPending}
        data-testid="monitor-add-prompt-submit"
      >
        {create.isPending ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}

// Inline competitor-add form. Matches the existing /competitors page body:
// name + domain are the only required fields, brandId scopes to the active
// brand. Same query keys so the leaderboard / tracked list both refresh.
function AddCompetitorForm({ brandId, onDone }: { brandId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => apiRequest("POST", `/api/competitors`, { brandId, name, domain }),
    onSuccess: () => {
      toast({ title: "Competitor added" });
      queryClient.invalidateQueries({ queryKey: ["/api/competitors", brandId] });
      queryClient.invalidateQueries({
        queryKey: ["/api/competitors/leaderboard", brandId],
      });
      setName("");
      setDomain("");
      onDone();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not add competitor",
        description: err.message,
        variant: "destructive",
      }),
  });
  return (
    <div className="space-y-3">
      <Label htmlFor="monitor-add-competitor-name">Name</Label>
      <Input
        id="monitor-add-competitor-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Acme PR Agency"
        data-testid="monitor-add-competitor-name"
      />
      <Label htmlFor="monitor-add-competitor-domain">Website domain</Label>
      <Input
        id="monitor-add-competitor-domain"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        placeholder="e.g. acmepr.com"
        data-testid="monitor-add-competitor-domain"
      />
      <Button
        onClick={() => create.mutate()}
        disabled={!name.trim() || !domain.trim() || create.isPending}
        data-testid="monitor-add-competitor-submit"
      >
        {create.isPending ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}
