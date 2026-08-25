import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePromptTags, usePromptTagMutations, type PromptTag } from "@/hooks/usePrompts";

// A fixed, curated palette rather than a free color-picker - keeps every tag
// legible against both themes (each entry already used at 1a alpha in
// TagChip) and keeps the "New tag" flow to one click, not a color-theory
// exercise.
const TAG_COLORS = [
  "#3b5bf6", // vc-accent
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#64748b",
];

function ColorSwatch({ color }: { color: string | null }) {
  return (
    <span
      className="inline-block h-4 w-4 rounded-full border border-vc-default"
      style={{ backgroundColor: color ?? "var(--bg-surface-1)" }}
      aria-hidden
    />
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded p-0.5 hover:bg-vc-muted"
          aria-label="Change tag color"
        >
          <ColorSwatch color={value} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-4 gap-1.5">
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className="h-6 w-6 rounded-full border border-vc-default transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                outline: value === c ? "2px solid var(--fg-primary)" : "none",
              }}
              aria-label={`Set color ${c}`}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TagNameCell({ tag, onSave }: { tag: PromptTag; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tag.name);

  if (!editing) {
    return (
      <button
        type="button"
        className="text-left text-caption font-medium text-vc-primary hover:underline"
        onClick={() => {
          setDraft(tag.name);
          setEditing(true);
        }}
      >
        {tag.name}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== tag.name) onSave(trimmed);
  };

  return (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className="h-7 max-w-[220px] text-caption"
    />
  );
}

export function TagsTab({ selectedBrandId }: { selectedBrandId: string }) {
  const { data: tagsData, isLoading } = usePromptTags(selectedBrandId);
  const { create, update, remove } = usePromptTagMutations(selectedBrandId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<PromptTag | null>(null);

  const tags = tagsData?.data ?? [];

  function submitCreate() {
    const trimmed = newName.trim();
    if (!trimmed) {
      setCreating(false);
      return;
    }
    create.mutate(
      { name: trimmed, color: TAG_COLORS[tags.length % TAG_COLORS.length] },
      { onSettled: () => setCreating(false) },
    );
    setNewName("");
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
      <div className="mb-4 flex items-center justify-between">
        <p className="text-caption text-vc-tertiary">
          Group prompts by theme, audience, or campaign. Tags apply across the table and the detail
          page.
        </p>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New tag
          </Button>
        )}
      </div>

      {creating && (
        <div className="mb-3 flex items-center gap-2 rounded border border-vc-default bg-vc-surface p-2">
          <Input
            autoFocus
            placeholder="Tag name"
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

      {tags.length === 0 && !creating ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="mb-1 text-body text-vc-tertiary">No tags yet</p>
          <p className="mb-4 max-w-md text-caption text-vc-tertiary/80">
            Create a tag and apply it to prompts from the Prompts table.
          </p>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create tag
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Color</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Prompts</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags.map((tag) => (
              <TableRow key={tag.id}>
                <TableCell>
                  <ColorPicker
                    value={tag.color}
                    onChange={(color) => update.mutate({ tagId: tag.id, color })}
                  />
                </TableCell>
                <TableCell>
                  <TagNameCell
                    tag={tag}
                    onSave={(name) => update.mutate({ tagId: tag.id, name })}
                  />
                </TableCell>
                <TableCell className="text-right font-mono text-data tabular-nums text-vc-tertiary">
                  {tag.promptCount ?? 0}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="text-vc-hover hover:text-destructive"
                    aria-label={`Delete ${tag.name}`}
                    onClick={() => setDeleting(tag)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the tag from every prompt it's applied to
              {deleting?.promptCount ? ` (${deleting.promptCount} currently)` : ""}. This can't be
              undone.
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
