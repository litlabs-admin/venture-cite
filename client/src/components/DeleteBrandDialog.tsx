import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";

interface Props {
  brandId: string;
  brandName: string;
  isPending: boolean;
  onConfirm: (id: string) => void;
}

interface DeletionPreview {
  articles: number;
  prompts: number;
  citationRuns: number;
}

// GitHub-style destructive confirm: user must type the brand name exactly.
// Prevents double-clicks and fat-fingered deletes.
export default function DeleteBrandDialog({ brandId, brandName, isPending, onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === brandName.trim();

  // Wave 6.6: fetch counts of affected child rows the moment the dialog
  // opens. Keeps the request out of the list view's render path so scrolling
  // through brands doesn't fire N preview calls.
  const { data: previewData, isLoading: previewLoading } = useQuery<{
    success: boolean;
    data: DeletionPreview;
  }>({
    queryKey: [`/api/brands/${brandId}/deletion-preview`],
    enabled: open,
    staleTime: 10_000,
  });
  const counts = previewData?.data;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid={`button-delete-${brandId}`}
          aria-label={`Delete brand ${brandName}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{brandName}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this brand and <strong>all related data</strong>. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <div className="font-medium mb-1 text-destructive">Deleting will remove:</div>
          {previewLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Counting affected records…</span>
            </div>
          ) : counts ? (
            <ul className="list-disc list-inside space-y-0.5 text-foreground">
              <li data-testid={`preview-articles-${brandId}`}>
                {counts.articles} article{counts.articles === 1 ? "" : "s"}
              </li>
              <li data-testid={`preview-prompts-${brandId}`}>
                {counts.prompts} citation prompt{counts.prompts === 1 ? "" : "s"}
              </li>
              <li data-testid={`preview-runs-${brandId}`}>
                {counts.citationRuns} citation run{counts.citationRuns === 1 ? "" : "s"}
              </li>
              <li className="text-muted-foreground">
                …plus all distributions, rankings, mentions, and analytics
              </li>
            </ul>
          ) : (
            <p className="text-muted-foreground">
              Could not load counts. Delete will proceed if you continue.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`confirm-delete-${brandId}`} className="text-sm">
            Type <span className="font-mono font-semibold">{brandName}</span> to confirm
          </Label>
          <Input
            id={`confirm-delete-${brandId}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            data-testid={`input-confirm-delete-${brandId}`}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!matches || isPending}
            onClick={(e) => {
              // Guard against double-clicks and allow the confirm only when
              // the typed value matches exactly.
              if (!matches || isPending) {
                e.preventDefault();
                return;
              }
              onConfirm(brandId);
              setOpen(false);
              setTyped("");
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            data-testid={`button-confirm-delete-${brandId}`}
          >
            Delete brand and all data
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
