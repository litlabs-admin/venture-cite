// Memory tab (business-context.md). "Add memory" opens an inline form
// (Type + text, matching the screenshot); saving prepends the new row,
// bumps "Remembered · N", and fires the bottom-centre confirmation toast.
// Each row's Edit/Forget live behind a hover menu, matching
// AskThreadList.tsx's own row-hover idiom so this page reads as the same
// product as the Ask workspace it configures.
import { useState } from "react";
import { Plus, MoreHorizontal, Pencil, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/queryClient";
import { useAskMemories } from "@/hooks/useAskMemories";
import { cn } from "@/lib/utils";
import {
  ASK_MEMORY_TYPES,
  ASK_MEMORY_TYPE_LABELS,
  ASK_MEMORY_TYPE_PLACEHOLDERS,
  type AskMemoryType,
  type AskMemoryView,
} from "@shared/ask/memory";
import { AskContextToast, type AskContextToastState } from "./AskContextToast";

function relativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MemoryForm({
  initialType,
  initialContent,
  submitLabel,
  isPending,
  onCancel,
  onSubmit,
}: {
  initialType: AskMemoryType;
  initialContent: string;
  submitLabel: string;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (input: { type: AskMemoryType; content: string }) => void;
}) {
  const [type, setType] = useState<AskMemoryType>(initialType);
  const [content, setContent] = useState(initialContent);

  return (
    <div className="animate-fade-in-up rounded-md border border-vc-accent/40 bg-vc-surface p-4 motion-reduce:animate-none">
      <div className="mb-3 space-y-1.5">
        <Label className="text-caption text-vc-secondary">Type</Label>
        <Select value={type} onValueChange={(v) => setType(v as AskMemoryType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASK_MEMORY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {ASK_MEMORY_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mb-1 space-y-1.5">
        <Label className="text-caption text-vc-secondary">What should the Agent remember?</Label>
        <Textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={ASK_MEMORY_TYPE_PLACEHOLDERS[type]}
          rows={3}
        />
      </div>
      <p className="mb-3 text-data text-vc-tertiary">
        Saved for everyone with access to this brand. Keep writing preferences in Your preferences.
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={content.trim().length === 0 || isPending}
          onClick={() => onSubmit({ type, content: content.trim() })}
        >
          {isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" disabled={isPending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function MemoryRow({
  memory,
  onEdit,
  onForget,
  isForgetting,
}: {
  memory: AskMemoryView;
  onEdit: () => void;
  onForget: () => void;
  isForgetting: boolean;
}) {
  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-md border border-vc-default bg-vc-surface p-3 transition-opacity",
        isForgetting && "opacity-40",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-full bg-vc-muted px-2 py-0.5 text-data font-medium text-vc-tertiary">
            {ASK_MEMORY_TYPE_LABELS[memory.type]}
          </span>
          {memory.origin === "learned" && (
            <span className="text-data text-vc-tertiary">learned from a conversation</span>
          )}
          <span className="text-data text-vc-tertiary">· {relativeDate(memory.createdAt)}</span>
        </div>
        <p className="text-caption text-vc-primary">{memory.content}</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Memory options"
            disabled={isForgetting}
            className="shrink-0 rounded-sm p-1 text-vc-tertiary opacity-0 transition-opacity hover:bg-vc-muted hover:text-vc-primary group-hover:opacity-100 focus-visible:opacity-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onForget}>
            <EyeOff className="mr-2 h-3.5 w-3.5" />
            Forget
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function MemoryTab({ brandId }: { brandId: string | null }) {
  const { toast } = useToast();
  const { memories, isLoading, addMemory, editMemory, forgetMemory } = useAskMemories(brandId);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<AskContextToastState>(null);
  const [forgettingId, setForgettingId] = useState<string | null>(null);

  const showConfirmation = (message: string) => setConfirmation({ key: Date.now(), message });

  const handleAdd = (input: { type: AskMemoryType; content: string }) => {
    addMemory.mutate(input, {
      onSuccess: () => {
        setAdding(false);
        showConfirmation("Saved to memory");
      },
      onError: (err) =>
        toast({
          description: getApiErrorMessage(err, "Failed to save memory"),
          variant: "destructive",
        }),
    });
  };

  const handleEdit = (id: string, input: { type: AskMemoryType; content: string }) => {
    editMemory.mutate(
      { id, ...input },
      {
        onSuccess: () => {
          setEditingId(null);
          showConfirmation("Memory updated");
        },
        onError: (err) =>
          toast({
            description: getApiErrorMessage(err, "Failed to update memory"),
            variant: "destructive",
          }),
      },
    );
  };

  const handleForget = (id: string) => {
    setForgettingId(id);
    forgetMemory.mutate(id, {
      onSettled: () => setForgettingId(null),
      onError: (err) =>
        toast({
          description: getApiErrorMessage(err, "Failed to forget memory"),
          variant: "destructive",
        }),
    });
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h2 className="text-body font-semibold text-vc-primary">What the Agent remembers</h2>
          <p className="mt-1 text-caption text-vc-tertiary">
            Shared knowledge about this brand. Review what the Agent has learned, correct it, or ask
            it to forget.
          </p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add memory
          </Button>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {adding && (
          <MemoryForm
            initialType="business_context"
            initialContent=""
            submitLabel="Save memory"
            isPending={addMemory.isPending}
            onCancel={() => setAdding(false)}
            onSubmit={handleAdd}
          />
        )}

        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-vc-muted" />
            ))}
          </div>
        ) : memories.length === 0 && !adding ? (
          <div className="rounded-md border border-dashed border-vc-default py-10 text-center">
            <p className="text-caption font-medium text-vc-primary">A fresh start</p>
            <p className="mt-1 text-caption text-vc-tertiary">
              Add a useful fact, or let the Agent learn from your conversations. You can review and
              correct it here.
            </p>
          </div>
        ) : (
          <>
            {memories.length > 0 && (
              <p className="text-caption font-medium text-vc-secondary">
                Remembered <span className="text-vc-tertiary">· {memories.length}</span>
              </p>
            )}
            {memories.map((memory) =>
              editingId === memory.id ? (
                <MemoryForm
                  key={memory.id}
                  initialType={memory.type}
                  initialContent={memory.content}
                  submitLabel="Save changes"
                  isPending={editMemory.isPending}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(input) => handleEdit(memory.id, input)}
                />
              ) : (
                <MemoryRow
                  key={memory.id}
                  memory={memory}
                  onEdit={() => setEditingId(memory.id)}
                  onForget={() => handleForget(memory.id)}
                  isForgetting={forgettingId === memory.id}
                />
              ),
            )}
          </>
        )}
      </div>

      <AskContextToast toast={confirmation} onDone={() => setConfirmation(null)} />
    </div>
  );
}
