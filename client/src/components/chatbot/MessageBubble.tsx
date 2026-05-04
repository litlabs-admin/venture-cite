import { useState } from "react";
import { Bot, Copy, Check, RefreshCw } from "lucide-react";
import SafeMarkdown from "@/components/SafeMarkdown";
import { cn } from "@/lib/utils";
import type { Msg } from "@/hooks/useChatbot";

export function MessageBubble({
  msg,
  isStreaming,
  showActions,
  onCopy,
  onRegenerate,
}: {
  msg: Msg;
  isStreaming: boolean;
  showActions: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3.5 py-2 text-sm whitespace-pre-wrap break-words">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5 group">
      <div className="flex-shrink-0 mt-0.5">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center">
          <Bot className="h-3.5 w-3.5 text-primary" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-muted-foreground mb-0.5">AI Tutor</div>
        <div
          className={cn(
            "rounded-2xl rounded-tl-md bg-muted px-3.5 py-2.5",
            "prose prose-sm dark:prose-invert max-w-none",
            "prose-p:my-1.5 prose-p:leading-relaxed",
            "prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-2 prose-headings:mb-1",
            "prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5",
            "prose-code:text-xs prose-code:bg-background/60 prose-code:px-1 prose-code:py-0.5 prose-code:rounded",
            "prose-code:before:content-none prose-code:after:content-none",
            "prose-blockquote:border-l-primary/40 prose-blockquote:text-foreground/80 prose-blockquote:not-italic",
            "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
            "prose-strong:text-foreground",
          )}
        >
          {msg.content ? (
            <SafeMarkdown>{msg.content}</SafeMarkdown>
          ) : (
            <span className="text-muted-foreground text-sm">Thinking…</span>
          )}
          {isStreaming && msg.content && (
            <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>
        {showActions && msg.content && !isStreaming && (
          <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent"
              aria-label="Copy message"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy
                </>
              )}
            </button>
            <button
              onClick={onRegenerate}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent"
              aria-label="Regenerate response"
            >
              <RefreshCw className="h-3 w-3" /> Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
