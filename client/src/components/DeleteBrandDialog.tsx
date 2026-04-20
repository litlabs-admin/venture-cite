import { useState } from "react";
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
import { Trash2 } from "lucide-react";

interface Props {
  brandId: string;
  brandName: string;
  isPending: boolean;
  onConfirm: (id: string) => void;
}

// GitHub-style destructive confirm: user must type the brand name exactly.
// Prevents double-clicks and fat-fingered deletes.
export default function DeleteBrandDialog({ brandId, brandName, isPending, onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === brandName.trim();

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
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{brandName}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this brand and <strong>all related data</strong> including articles, keywords, citations, prompts, AI visibility progress, and distribution history. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

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
