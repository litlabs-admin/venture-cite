import { useState } from "react";
import { ArrowLeft, Trash2, MessageSquare, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ThreadSummary } from "@/hooks/useChatbot";

function relativeTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString();
}

export function HistoryView({
  threads,
  loading,
  activeThreadId,
  onBack,
  onSelect,
  onArchive,
  onRestore,
}: {
  threads: ThreadSummary[];
  loading: boolean;
  activeThreadId: string | null;
  onBack: () => void;
  onSelect: (threadId: string) => void;
  onArchive: (threadId: string) => Promise<void>;
  onRestore: (threadId: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const handleArchive = async (threadId: string) => {
    setArchivingId(threadId);
    try {
      await onArchive(threadId);
      toast({
        title: "Conversation archived",
        description: "Tap Undo within 5 seconds to restore.",
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await onRestore(threadId);
                toast({ title: "Restored" });
              } catch {
                toast({ title: "Couldn't restore", variant: "destructive" });
              }
            }}
          >
            Undo
          </Button>
        ),
        duration: 5000,
      });
    } catch {
      toast({ title: "Couldn't archive", variant: "destructive" });
    } finally {
      setArchivingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onBack}
          aria-label="Back to conversation"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-semibold">Conversations</div>
        <div className="ml-auto text-[11px] text-muted-foreground">
          {threads.length} {threads.length === 1 ? "chat" : "chats"}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2" role="listbox" aria-label="Past conversations">
        {loading ? (
          <div className="space-y-1 px-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center text-center px-6 pt-8 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-2 opacity-50" aria-hidden />
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs mt-1">Start one from the welcome screen.</p>
          </div>
        ) : (
          threads.map((t) => {
            const isActive = t.id === activeThreadId;
            const isArchiving = archivingId === t.id;
            return (
              <div
                key={t.id}
                role="option"
                aria-selected={isActive}
                className={cn(
                  "group flex items-start gap-2 px-3 py-2.5 mx-2 rounded-lg",
                  "hover:bg-accent cursor-pointer transition-colors",
                  isActive && "bg-accent",
                  isArchiving && "opacity-50 pointer-events-none",
                )}
                onClick={() => onSelect(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(t.id);
                  }
                }}
                tabIndex={0}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isActive && (
                      <Check className="h-3 w-3 text-primary flex-shrink-0" aria-hidden />
                    )}
                    <div className="text-sm font-medium truncate">{t.title}</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {relativeTime(t.updatedAt)} · {t.messageCount}{" "}
                    {t.messageCount === 1 ? "msg" : "msgs"}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleArchive(t.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1.5 rounded hover:bg-background/60 transition-opacity"
                  aria-label="Archive conversation"
                  disabled={isArchiving}
                >
                  {isArchiving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
