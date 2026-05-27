// Standalone theme toggle — three-button segmented control for use anywhere
// outside a dropdown (Settings page primarily). Roving-tabindex keyboard
// pattern: arrow keys move between options, Space/Enter selects, Home/End
// jump to ends. Matches WAI-ARIA radiogroup semantics so screen readers
// narrate it correctly.
//
// Visual register: neutral. The active option gets a raised surface
// (bg-surface-3 → matches the sidebar's active-nav chip) plus full-contrast
// foreground. The brand-accent indigo stays reserved for primary actions
// per DESIGN.md.

import { useCallback, useRef } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // Refs for roving-tabindex focus management. Without this, arrow-key
  // navigation works at the radiogroup level but actual focus doesn't
  // move with the selection — screen-reader UX feels jumpy.
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      const lastIndex = OPTIONS.length - 1;
      let nextIndex: number | null = null;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = lastIndex;
      }
      if (nextIndex !== null) {
        event.preventDefault();
        const next = OPTIONS[nextIndex];
        setTheme(next.value);
        buttonRefs.current[nextIndex]?.focus();
      }
    },
    [setTheme],
  );

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={cn(
        // 1px border + matched inner padding so the active "chip" sits
        // flush. The shadow recess is dark-mode only, light gets a hairline
        // — handled by --border-default + --bg-surface-1 token swap.
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-[var(--bg-surface-1)] p-0.5",
        className,
      )}
      data-testid="theme-toggle"
    >
      {OPTIONS.map(({ value, label, icon: Icon }, index) => {
        const selected = theme === value;
        return (
          <button
            key={value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            // Roving tabindex: only the selected option is in the tab
            // sequence. Arrow keys move through the rest.
            tabIndex={selected ? 0 : -1}
            onClick={() => setTheme(value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            data-testid={`theme-toggle-${value}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium",
              "transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              selected
                ? // Raised neutral chip — matches the active-nav treatment.
                  // No indigo here; brand colour stays reserved.
                  "bg-[var(--bg-surface-3)] text-foreground shadow-[var(--elevation-raised)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
