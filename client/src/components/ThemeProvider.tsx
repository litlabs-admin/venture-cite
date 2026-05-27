// Theme React context + provider.
//
// One source of truth in React; the actual DOM mutation lives in
// lib/theme.ts. The provider:
//
//   1. Reads the initial theme from localStorage (set by the FOUC-blocking
//      preload script in index.html, which has already applied the correct
//      `.dark` class to <html>).
//   2. Re-applies on every change to keep state ↔ DOM in lockstep.
//   3. Subscribes to OS `prefers-color-scheme` changes IFF theme==="system".
//   4. Subscribes to cross-tab `storage` events so the same user gets a
//      consistent view across windows.
//
// React 19 / 18.3 compatibility: uses standard useState + useEffect, no
// useSyncExternalStore tricks needed (we own the source of truth).

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  applyResolvedTheme,
  getStoredTheme,
  getSystemTheme,
  resolveTheme,
  setStoredTheme,
  subscribeToStorageTheme,
  subscribeToSystemTheme,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

interface ThemeContextValue {
  /** What the user picked. May be "system". */
  theme: Theme;
  /** What's actually on screen right now. Always "light" or "dark". */
  resolvedTheme: ResolvedTheme;
  /** Persist + apply. */
  setTheme: (next: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initial values: read straight from storage. The preload script has
  // ALREADY applied the right class, so we don't paint twice; we're
  // just hydrating React state to match the DOM.
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(getStoredTheme()),
  );

  const setTheme = useCallback((next: Theme) => {
    setStoredTheme(next);
    setThemeState(next);
    const resolved = resolveTheme(next);
    setResolvedTheme(resolved);
    applyResolvedTheme(resolved);
  }, []);

  // When the user picks "system", listen to OS-level changes and follow.
  // Cleanup when the dep changes (e.g. user picks "dark" → unsubscribe).
  useEffect(() => {
    if (theme !== "system") return;
    // Refresh once on mount in case the OS preference changed between the
    // preload-script's read and React mounting (rare but possible on slow
    // first paints).
    const systemNow = getSystemTheme();
    setResolvedTheme(systemNow);
    applyResolvedTheme(systemNow);
    return subscribeToSystemTheme((next) => {
      setResolvedTheme(next);
      applyResolvedTheme(next);
    });
  }, [theme]);

  // Cross-tab sync. Storage events don't fire in the same tab, so this
  // only handles "other tab updated" — no infinite-loop risk.
  useEffect(() => {
    return subscribeToStorageTheme((next) => {
      setThemeState(next);
      const resolved = resolveTheme(next);
      setResolvedTheme(resolved);
      applyResolvedTheme(resolved);
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Hook for any descendant of ThemeProvider. Throws (loudly, in dev) if
 *  used outside the provider — keeps misuse from silently no-oping. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme() must be used inside <ThemeProvider>");
  }
  return ctx;
}
