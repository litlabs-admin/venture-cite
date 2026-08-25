import { useState } from "react";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  usePromptAudiences,
  useGenerateAudiences,
  usePromptAudienceMutations,
  type PromptAudience,
} from "@/hooks/usePrompts";
import { AudiencesOverviewTable } from "./AudiencesOverviewTable";
import { AudiencesJourneyTable } from "./AudiencesJourneyTable";

// No "Simulate" action here - trakkr's own meaning for it is unclear and
// nothing in this codebase backs a hypothetical-audience simulation (see the
// Prompts rebuild plan's "Resolved design calls"). New-audience (manual) and
// Generate (AI, cooldown-gated) are the only two ways an audience is created.
export function AudiencesTab({ selectedBrandId }: { selectedBrandId: string }) {
  const { toast } = useToast();
  const { data, isLoading } = usePromptAudiences(selectedBrandId);
  const generate = useGenerateAudiences(selectedBrandId);
  const { create, remove } = usePromptAudienceMutations(selectedBrandId);

  const [view, setView] = useState<"overview" | "journey">("overview");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<PromptAudience | null>(null);

  const audiences = data?.data ?? [];

  function submitCreate() {
    const trimmed = newName.trim();
    if (!trimmed) {
      setCreating(false);
      return;
    }
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (body: any) => {
          if (!body.success) {
            toast({
              title: "Couldn't create audience",
              description: body.error,
              variant: "destructive",
            });
          }
        },
        onSettled: () => setCreating(false),
      },
    );
    setNewName("");
  }

  function onGenerate() {
    generate.mutate(undefined, {
      onSuccess: ({ body }: any) => {
        if (body.success) {
          toast({
            title: `Generated ${body.data.length} audience${body.data.length === 1 ? "" : "s"}`,
          });
        } else {
          toast({
            title: "Couldn't generate audiences",
            description: body.error,
            variant: "destructive",
          });
        }
      },
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-px px-8 py-6">
        <div className="h-8 w-full animate-pulse bg-vc-muted/40" />
        <div className="h-8 w-full animate-pulse bg-vc-muted/40" />
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-caption text-vc-tertiary">
          Group prompts by who's asking and where they are in the buying journey.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={onGenerate} disabled={generate.isPending}>
            {generate.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generate with AI
          </Button>
          {!creating && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New audience
            </Button>
          )}
        </div>
      </div>

      {creating && (
        <div className="mb-3 flex items-center gap-2 rounded border border-vc-default bg-vc-surface p-2">
          <Input
            autoFocus
            placeholder="Audience name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            className="h-8 max-w-xs"
          />
          <Button size="sm" onClick={submitCreate} disabled={create.isPending}>
            Create
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </div>
      )}

      {audiences.length === 0 && !creating ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="mb-1 text-body text-vc-tertiary">No audiences yet</p>
          <p className="mb-4 max-w-md text-caption text-vc-tertiary/80">
            Generate audiences from your tracked prompts with AI, or create one by hand.
          </p>
          <Button size="sm" onClick={onGenerate} disabled={generate.isPending}>
            {generate.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generate with AI
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-1 rounded border border-vc-default p-0.5 w-fit">
            <button
              type="button"
              onClick={() => setView("overview")}
              className={`rounded px-3 py-1 text-caption font-medium transition-colors ${
                view === "overview" ? "bg-vc-muted text-vc-primary" : "text-vc-tertiary"
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setView("journey")}
              className={`rounded px-3 py-1 text-caption font-medium transition-colors ${
                view === "journey" ? "bg-vc-muted text-vc-primary" : "text-vc-tertiary"
              }`}
            >
              Journey
            </button>
          </div>

          {view === "overview" ? (
            <AudiencesOverviewTable audiences={audiences} />
          ) : (
            <AudiencesJourneyTable audiences={audiences} />
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {audiences.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setDeleting(a)}
                className="group flex items-center gap-1 rounded-full border border-vc-default px-2 py-1 text-data text-vc-tertiary hover:border-destructive/40 hover:text-destructive"
                title={`Delete ${a.name}`}
              >
                {a.name}
                <Trash2 className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the audience from every prompt it's applied to. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) remove.mutate(deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
