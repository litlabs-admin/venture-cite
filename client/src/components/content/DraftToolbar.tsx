import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, ChevronDown, ChevronUp, Loader2, Trash2 } from "lucide-react";
import { draftStatus, draftLabel, relativeTime, type DraftableArticle } from "./draftHelpers";

// Recent drafts dropdown. Lists every article in {draft, generating, failed}.
// Clicking one navigates to /content/:articleId; the trash icon soft-deletes.

interface DraftToolbarProps {
  drafts: DraftableArticle[];
  activeDraftId: string | null;
  onNewArticle: () => void | Promise<void>;
  onLoadDraft: (d: DraftableArticle) => void;
  onDeleteDraft: (id: string) => void | Promise<void>;
}

export default function DraftToolbar({
  drafts,
  activeDraftId,
  onNewArticle,
  onLoadDraft,
  onDeleteDraft,
}: DraftToolbarProps) {
  const [showDraftPanel, setShowDraftPanel] = useState(false);
  const draftPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDraftPanel) return;
    const handler = (e: MouseEvent) => {
      if (draftPanelRef.current && !draftPanelRef.current.contains(e.target as Node)) {
        setShowDraftPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDraftPanel]);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button size="sm" variant="outline" onClick={onNewArticle} className="gap-1.5">
        <Plus className="h-4 w-4" />
        New Article
      </Button>

      {drafts.length > 0 && (
        <div className="relative" ref={draftPanelRef}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowDraftPanel((p) => !p)}
            className="gap-1.5 text-muted-foreground"
          >
            <FileText className="h-4 w-4" />
            {drafts.length} draft{drafts.length !== 1 ? "s" : ""}
            {showDraftPanel ? (
              <ChevronUp className="h-3 w-3 ml-0.5" />
            ) : (
              <ChevronDown className="h-3 w-3 ml-0.5" />
            )}
          </Button>

          {showDraftPanel && (
            <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-popover border border-border rounded-lg shadow-lg">
              <div className="max-h-64 overflow-y-auto p-1">
                {drafts.map((draft) => {
                  const status = draftStatus(draft);
                  const isActive = draft.id === activeDraftId;
                  return (
                    <div
                      key={draft.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors group ${
                        isActive ? "bg-primary/10 text-foreground" : "hover:bg-accent"
                      }`}
                      onClick={() => {
                        if (!isActive) onLoadDraft(draft);
                        setShowDraftPanel(false);
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{draftLabel(draft)}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 h-4 ${
                              status === "generating"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                : status === "failed"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                  : status === "ready"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                    : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {status === "generating" && (
                              <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin inline" />
                            )}
                            {status === "generating"
                              ? "Generating"
                              : status === "failed"
                                ? "Failed"
                                : status === "ready"
                                  ? "Done"
                                  : "Draft"}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {relativeTime(draft.updatedAt)}
                          </span>
                        </div>
                      </div>
                      <button
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteDraft(draft.id);
                        }}
                        title="Delete draft"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {activeDraftId && drafts.find((d) => d.id === activeDraftId) && (
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Editing:{" "}
          <span className="font-medium text-foreground">
            {draftLabel(drafts.find((d) => d.id === activeDraftId)!)}
          </span>
        </span>
      )}
    </div>
  );
}
