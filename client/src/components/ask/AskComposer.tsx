// Composer: idle (send) / running (stop). Placeholder text matches Trakkr's
// observed copy - "Ask anything" idle, "Follow up…" while running
// (01-trakkr-teardown.md §2.3-§2.4).
import { forwardRef, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, Mic, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type AskComposerHandle = { focus: () => void };

// Imperative `focus()` handle - on /agent, ⌘K and the sidebar Ask pill focus
// this instead of opening the Ask window (AppShell.tsx), so a plain ref
// callback is simpler here than routing a "should I be focused" prop
// through AskWorkspace on every render.
export const AskComposer = forwardRef<
  AskComposerHandle,
  {
    isRunning: boolean;
    disabled?: boolean;
    onSend: (message: string) => void;
    onStop: () => void;
  }
>(function AskComposer({ isRunning, disabled, onSend, onStop }, ref) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || isRunning || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="rounded-md border border-vc-default bg-vc-surface p-3">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={isRunning ? "Follow up…" : "Ask anything"}
        disabled={disabled}
        rows={2}
        className="resize-none border-0 bg-transparent p-0 text-body shadow-none focus-visible:ring-0"
      />
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" disabled className="h-7 w-7 text-vc-tertiary">
            <Paperclip className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" disabled className="h-7 w-7 text-vc-tertiary">
            <Mic className="h-3.5 w-3.5" />
          </Button>
        </div>
        {isRunning ? (
          <Button
            size="icon"
            variant="default"
            className="h-7 w-7"
            onClick={onStop}
            aria-label="Stop generating"
          >
            <Square className="h-3 w-3" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant="default"
            className="h-7 w-7"
            disabled={disabled || !value.trim()}
            onClick={submit}
            aria-label="Send"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
});
