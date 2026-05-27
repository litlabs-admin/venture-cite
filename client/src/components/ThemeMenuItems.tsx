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
