import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useBrandSelection } from "@/hooks/use-brand-selection";
import { apiRequest } from "@/lib/queryClient";
import SafeMarkdown from "@/components/SafeMarkdown";

type Msg = { role: "user" | "assistant"; content: string };

const STARTER_PROMPTS = [
  "What's the difference between GEO, AEO, and SEO?",
  "How do I get started with VentureCite?",
  "Why aren't my citations showing up yet?",
  "How should I use Reddit for AEO?",
];

export default function EducationAssistant() {
  const { user } = useAuth();
  const { selectedBrandId } = useBrandSelection();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Per-user localStorage key for conversation persistence (client-side cache).
  const storageKey = user ? `venturecite-chatbot-history:${user.id}` : null;

  // Hydrate on first open
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setMessages(JSON.parse(raw));
    } catch {
      // ignore corrupt storage
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)));
    } catch {
      // ignore quota
    }
  }, [storageKey, messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useMutation({
    mutationFn: async (text: string) => {
      const next: Msg[] = [...messages, { role: "user" as const, content: text }];
      setMessages(next);
      setInput("");
      setError(null);
      const res = await apiRequest("POST", "/api/assistant/chat", {
        messages: next,
        brandId: selectedBrandId ?? undefined,
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error ?? "Failed to send message");
      }
      return json.data.content as string;
    },
    onSuccess: (content) => {
      setMessages((m) => [...m, { role: "assistant", content }]);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSend = (text: string) => {
    if (!text.trim() || send.isPending) return;
    send.mutate(text.trim());
  };

  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          aria-label="Open AI tutor"
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
          size="icon"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-[420px] flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle>AI Tutor</SheetTitle>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Ask me anything about GEO, AEO, SEO, or how to use VentureCite.
              </p>
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => handleSend(p)}
                  className="block w-full text-left text-sm border rounded-md p-2 hover:bg-accent"
                >
                  {p}
                </button>
              ))}
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-8 bg-primary/10 rounded-lg p-3"
                    : "mr-8 bg-muted rounded-lg p-3"
                }
              >
                <SafeMarkdown>{m.content}</SafeMarkdown>
              </div>
            ))
          )}
          {send.isPending && (
            <div className="mr-8 bg-muted rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive border border-destructive/30 rounded-md p-2">
              {error}
            </div>
          )}
        </div>

        <div className="border-t p-3 flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            placeholder="Ask a question…"
            className="min-h-[44px] resize-none"
            maxLength={2000}
            disabled={send.isPending}
          />
          <Button
            onClick={() => handleSend(input)}
            disabled={!input.trim() || send.isPending}
            size="icon"
            aria-label="Send message"
            className="min-h-[44px] min-w-[44px]"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
