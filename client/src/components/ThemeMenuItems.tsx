// Theme picker rendered AS a chunk of <DropdownMenu> children. Designed to
// drop into an existing DropdownMenuContent (the sidebar user menu) without
// adding its own trigger/content/portal. Keeps the keyboard nav from the
// parent menu intact — arrow keys flow from "Account settings" straight
// through "System / Light / Dark" without re-opening anything.
//
// We deliberately use DropdownMenuRadioGroup so the OS narrates each option
// as "radio button, checked/unchecked", not "menuitem". That's the correct
// affordance for a mutually-exclusive choice.

import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/lib/theme";

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

// A compact, always-visible light/dark toggle for the sidebar footer. The full
// System/Light/Dark picker still lives in the account menu (ThemeMenuItems);
// this surfaces the most common action (flip light<->dark) without the user
// having to discover the dropdown — a repeated piece of client feedback.
export function QuickThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      data-testid="quick-theme-toggle"
      className={
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        (className ?? "")
      }
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Appearance
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={theme}
        onValueChange={(v) => setTheme(v as Theme)}
        data-testid="theme-menu-radio-group"
      >
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuRadioItem
            key={value}
            value={value}
            className="cursor-pointer"
            data-testid={`theme-menu-item-${value}`}
          >
            <Icon className="mr-2 h-4 w-4" aria-hidden />
            <span>{label}</span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
