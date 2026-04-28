import { useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import SafeMarkdown from "@/components/SafeMarkdown";

// Split-pane markdown editor used by both the Content page (for in-progress
// drafts) and the Articles page (View/Edit dialog). Left pane is the raw
// editor; right pane is the live SafeMarkdown render. Word + character
// counts hang in a small toolbar above.
//
// Read-only mode (`editable={false}`) is used when streaming a generation —
// the worker is appending to the buffer; editing it would race.

interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  editable?: boolean;
  className?: string;
  placeholder?: string;
  minHeight?: number;
  // Optional callback for when the user blurs the textarea — useful for
  // explicit-save flows on top of auto-save.
  onBlur?: () => void;
}

function countWords(text: string): number {
  if (!text) return 0;
  // Strip markdown punctuation roughly so headings and links don't inflate
  // the count. This is intentionally heuristic — no need to be perfect.
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ") // code blocks
    .replace(/`[^`]*`/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → label
    .replace(/[#>*_~`>-]+/g, " ");
  return stripped.split(/\s+/).filter(Boolean).length;
}

export default function MarkdownEditor({
  value,
  onChange,
  editable = true,
  className = "",
  placeholder,
  minHeight = 400,
  onBlur,
}: MarkdownEditorProps) {
  const wordCount = useMemo(() => countWords(value), [value]);
  const charCount = value.length;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {wordCount.toLocaleString()} words · {charCount.toLocaleString()} characters
        </span>
        {!editable && <span className="italic">Read-only while generating…</span>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder ?? "# Title\n\nWrite your article in markdown..."}
          className="font-mono text-sm leading-relaxed resize-y"
          style={{ minHeight }}
          readOnly={!editable}
          data-testid="markdown-editor-textarea"
        />
        <div
          className="prose prose-sm dark:prose-invert max-w-none border border-border rounded-md p-4 overflow-y-auto bg-card"
          style={{ minHeight, maxHeight: "70vh" }}
          data-testid="markdown-editor-preview"
        >
          {value ? (
            <SafeMarkdown>{value}</SafeMarkdown>
          ) : (
            <p className="text-muted-foreground italic m-0">Preview will appear here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
