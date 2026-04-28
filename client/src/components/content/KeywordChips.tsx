import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// Chip-input for comma- or enter-separated keywords. Each chip is removable
// individually (vs the legacy comma-separated string which forced users to
// edit raw text). Used by the Content form and anywhere else we collect
// short tag-shaped values.
//
// Internal state is the unsubmitted draft; on Enter / comma / blur it pushes
// onto `value` via onChange. Duplicates (case-insensitive, trimmed) are
// silently dropped. Empty keywords are dropped too.

interface KeywordChipsProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

function normalize(s: string): string {
  return s.trim();
}

function dedupePush(list: string[], next: string): string[] {
  const trimmed = normalize(next);
  if (!trimmed) return list;
  const lower = trimmed.toLowerCase();
  if (list.some((k) => k.toLowerCase() === lower)) return list;
  return [...list, trimmed];
}

export default function KeywordChips({
  value,
  onChange,
  placeholder,
  disabled = false,
}: KeywordChipsProps) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    if (!draft.trim()) return;
    // Allow pasting "a, b, c" — split into multiple chips at once.
    const parts = draft.split(",").map(normalize).filter(Boolean);
    let next = value;
    for (const p of parts) next = dedupePush(next, p);
    onChange(next);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      // Backspace on empty input pops the last chip — standard chip-input UX.
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[34px] items-center">
        {value.map((k) => (
          <Badge
            key={k}
            variant="secondary"
            className="gap-1 pr-1"
            data-testid={`keyword-chip-${k.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {k}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== k))}
              className="hover:bg-muted-foreground/20 rounded-sm p-0.5"
              aria-label={`Remove ${k}`}
              disabled={disabled}
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={commit}
        placeholder={placeholder ?? "Type and press Enter or comma"}
        disabled={disabled}
        data-testid="keyword-chips-input"
      />
    </div>
  );
}
