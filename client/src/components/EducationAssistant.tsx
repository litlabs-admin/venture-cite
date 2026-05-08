// EducationAssistant — outer shell of the AI Tutor chatbot.
//
// Owns the Sheet open/close state and the view switcher (thread vs history).
// Data layer lives in `useChatbot`; per-view rendering is delegated to
// dedicated subcomponents under `./chatbot/`.

import { useState, useRef, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sparkles,
  Send,
  Square,
  Loader2,
  MoreVertical,
  Plus,
  History,
  Trash2,
  AlertCircle,
  ChevronRight,
  Bot,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { useToast } from "@/hooks/use-toast";
import { useChatbot } from "@/hooks/useChatbot";
import { cn } from "@/lib/utils";
import { MessageBubble } from "./chatbot/MessageBubble";
import { WelcomeState } from "./chatbot/WelcomeState";
import { HistoryView } from "./chatbot/HistoryView";
import { subscribeOpenChatbotPrompt } from "../lib/openChatbotPrompt";

type View = "thread" | "history";

function ChatTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open AI Tutor"
      data-tour-id="sidebar.chatbot"
      className={cn(
        "fixed bottom-6 right-6 z-40",
        "flex items-center gap-2 rounded-full pl-3 pr-4 h-12",
        "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground",
        "shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30",
        "transition-all hover:scale-105 active:scale-95",
        "ring-1 ring-primary/20",
      )}
    >
      <Sparkles className="h-5 w-5" />
      <span className="text-sm font-medium">AI Tutor</span>
    </button>
  );
}

export default function EducationAssistant() {
  const { user } = useAuth();
  const { selectedBrandId, selectedBrand } = useBrandSelection();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("thread");
  const [input, setInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chatbot = useChatbot({
    enabled: open && !!user,
    brandId: selectedBrandId || null,
  });

  // Reset to thread view whenever sheet reopens.
  useEffect(() => {
    if (open) setView("thread");
  }, [open]);

  // Listen for external open-with-prompt events (e.g. PageHeaderHelp fallback).
  useEffect(() => {
    return subscribeOpenChatbotPrompt((prompt) => {
      setOpen(true);
      setInput(prompt);
    });
  }, []);

  // Auto-scroll on new content.
  useEffect(() => {
    if (view !== "thread") return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatbot.messages, chatbot.isStreaming, view]);

  // Auto-focus composer on open.
  useEffect(() => {
    if (open && view === "thread") {
      const t = setTimeout(() => textareaRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open, view]);

  // Auto-grow textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      chatbot.send(trimmed);
      setInput("");
    },
    [chatbot],
  );

  const handleCopy = useCallback(
    (content: string) => {
      navigator.clipboard.writeText(content).catch(() => {
        toast({ title: "Couldn't copy", variant: "destructive" });
      });
    },
    [toast],
  );

  const handleArchiveCurrent = useCallback(async () => {
    if (!chatbot.activeThreadId) return;
    const id = chatbot.activeThreadId;
    try {
      await chatbot.archiveThread.mutateAsync(id);
      toast({
        title: "Conversation archived",
        description: "Tap Undo within 5 seconds to restore.",
        duration: 5000,
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await chatbot.restoreThread.mutateAsync(id);
                chatbot.selectThread(id);
                toast({ title: "Restored" });
              } catch {
                toast({ title: "Couldn't restore", variant: "destructive" });
              }
            }}
          >
            Undo
          </Button>
        ),
      });
    } catch {
      toast({ title: "Couldn't archive", variant: "destructive" });
    }
  }, [chatbot, toast]);

  const charCount = input.length;
  const showCharCount = charCount > 1500;
  const hasMessages = chatbot.messages.length > 0;
  const showWelcome = !hasMessages && !chatbot.messagesLoading;

  if (!user) return null;

  const activeThread = chatbot.threads.find((t) => t.id === chatbot.activeThreadId);

  return (
    <TooltipProvider delayDuration={300}>
      <Sheet open={open} onOpenChange={setOpen}>
        <ChatTrigger onClick={() => setOpen(true)} />

        <SheetContent side="right" className="w-full sm:max-w-[460px] flex flex-col p-0 gap-0">
          {/* Header */}
          <SheetHeader className="px-4 py-3 pr-12 border-b space-y-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-sm leading-tight">AI Tutor</SheetTitle>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Your GEO/AEO strategist
                  </p>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Chat options">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onClick={() => {
                      setView("thread");
                      chatbot.newChat();
                    }}
                    disabled={chatbot.isCreatingThread || chatbot.isStreaming}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New chat
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setView(view === "history" ? "thread" : "history")}
                  >
                    <History className="h-4 w-4 mr-2" />
                    Conversation history
                    {chatbot.threads.length > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {chatbot.threads.length}
                      </span>
                    )}
                  </DropdownMenuItem>
                  {chatbot.activeThreadId && hasMessages && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleArchiveCurrent}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Archive this chat
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Active thread + brand chip row (only in thread view) */}
            {view === "thread" && (activeThread || selectedBrand) && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {activeThread && (
                  <button
                    onClick={() => setView("history")}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-accent text-[11px] text-muted-foreground"
                    aria-label="Switch conversation"
                  >
                    <span className="font-medium text-foreground truncate max-w-[200px]">
                      {activeThread.title}
                    </span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                )}
                {selectedBrand && (
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/60 text-[11px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {selectedBrand.name}
                  </div>
                )}
              </div>
            )}
          </SheetHeader>

          {/* Body — switches between thread and history */}
          {view === "history" ? (
            <HistoryView
              threads={chatbot.threads}
              loading={chatbot.threadsLoading}
              activeThreadId={chatbot.activeThreadId}
              onBack={() => setView("thread")}
              onSelect={(id) => {
                chatbot.selectThread(id);
                setView("thread");
              }}
              onArchive={async (id) => {
                await chatbot.archiveThread.mutateAsync(id);
              }}
              onRestore={async (id) => {
                await chatbot.restoreThread.mutateAsync(id);
              }}
            />
          ) : (
            <>
              {/* Transcript */}
              <div
                ref={scrollRef}
                role="log"
                aria-live="polite"
                aria-atomic="false"
                className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
              >
                {chatbot.messagesLoading && !hasMessages ? (
                  <div className="space-y-3 pt-2">
                    <div className="h-12 w-3/4 rounded-2xl bg-muted animate-pulse" />
                    <div className="h-20 rounded-2xl bg-muted animate-pulse" />
                  </div>
                ) : showWelcome ? (
                  <WelcomeState onPick={handleSend} brandName={selectedBrand?.name ?? null} />
                ) : (
                  <>
                    {chatbot.messages.map((m, i) => {
                      const isLast = i === chatbot.messages.length - 1;
                      const isLastAssistantStreaming =
                        chatbot.isStreaming && isLast && m.role === "assistant";
                      return (
                        <MessageBubble
                          key={i}
                          msg={m}
                          isStreaming={isLastAssistantStreaming}
                          showActions={m.role === "assistant"}
                          onCopy={() => handleCopy(m.content)}
                          onRegenerate={chatbot.regenerate}
                        />
                      );
                    })}
                    {chatbot.isStreaming &&
                      chatbot.messages[chatbot.messages.length - 1]?.role === "user" && (
                        <div className="flex gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center">
                            <Bot className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="rounded-2xl rounded-tl-md bg-muted px-3.5 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Thinking…
                          </div>
                        </div>
                      )}
                  </>
                )}

                {chatbot.brandSwitchNotice && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-2.5">
                    <Sparkles className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <div className="flex-1 text-sm text-foreground">
                      {chatbot.brandSwitchNotice}
                      <button
                        onClick={chatbot.dismissBrandSwitchNotice}
                        className="ml-2 text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {chatbot.budgetExceeded && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <div className="font-medium text-foreground">
                          Daily AI Tutor limit reached
                        </div>
                        <p className="text-muted-foreground text-xs mt-1">
                          You've used today's free AI Tutor messages. Resets at midnight UTC.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {chatbot.error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="flex-1 text-sm">
                      <div className="text-foreground">{chatbot.error}</div>
                      <button
                        onClick={chatbot.regenerate}
                        className="text-xs text-primary hover:underline mt-1"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="relative flex items-end gap-2">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(input);
                      }
                    }}
                    placeholder="Ask anything about GEO, AEO, SEO, or VentureCite…"
                    className="min-h-[44px] max-h-[160px] resize-none text-sm py-2.5"
                    maxLength={2000}
                    disabled={chatbot.budgetExceeded}
                    aria-label="Message"
                  />
                  {chatbot.isStreaming ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={chatbot.stop}
                          size="icon"
                          variant="outline"
                          aria-label="Stop generating"
                          className="min-h-[44px] min-w-[44px] flex-shrink-0"
                        >
                          <Square className="h-4 w-4 fill-current" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Stop generating</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => handleSend(input)}
                          disabled={!input.trim() || chatbot.budgetExceeded}
                          size="icon"
                          aria-label="Send message"
                          className="min-h-[44px] min-w-[44px] flex-shrink-0"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Send (Enter)</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground px-1">
                  <span>Enter to send · Shift+Enter for newline</span>
                  {showCharCount && (
                    <span className={cn(charCount > 1900 && "text-amber-600")}>
                      {charCount} / 2000
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
