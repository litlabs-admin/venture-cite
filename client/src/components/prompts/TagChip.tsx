import { X } from "lucide-react";
import type { PromptTag } from "@/hooks/usePrompts";

// A null/missing color renders a neutral vc-muted chip rather than a
// fabricated one - color is optional at creation (see prompt_tags.color).
export function TagChip({
  tag,
  onRemove,
  size = "sm",
}: {
  tag: Pick<PromptTag, "id" | "name" | "color">;
  onRemove?: () => void;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-[11px]";
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full font-medium ${dim}`}
      style={
        tag.color
          ? { backgroundColor: `${tag.color}1a`, color: tag.color }
          : { backgroundColor: "var(--bg-surface-1)", color: "var(--fg-tertiary)" }
      }
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${tag.name} tag`}
          className="opacity-60 hover:opacity-100"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}
