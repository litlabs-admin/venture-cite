// Theme system — production-grade light / dark / system toggle.
//
// Design decisions, locked:
//
// 1. Three modes, not two. "system" follows OS prefers-color-scheme; "light"
//    and "dark" are explicit overrides. This is what GitHub, Vercel, and
//    Linear ship — anything less feels primitive in 2026.
//
// 2. Dark is the FALLBACK when no signal is available. The CSS in index.css
//    is hand-tuned for dark-first ("DARK is the default the user lands on").
//    If localStorage has no preference AND the browser cannot read a system
//    preference, we apply dark. Users with an explicit OS preference get
//    their OS choice respected through `theme = "system"`.
//
// 3. Class strategy, not data-attribute. tailwind.config.ts is configured
//    with `darkMode: ["class"]`, so we toggle `<html class="dark">`.
//
// 4. No FOUC. The pre-hydration script in index.html runs SYNCHRONOUSLY
//    before React mounts and applies the right class on `<html>`. This
//    module never sets the initial class — it only updates it on user
//    action or system-pref change. See `themePreloadScript` (string) below
//    for the script that mirrors this module's logic in vanilla JS.
//
// 5. Cross-tab sync via the `storage` event. Open the app in two tabs,
//    toggle in one, the other follows.
//
// 6. Graceful degradation. localStorage in private mode can throw; we
//    catch and treat it as "no stored preference." matchMedia unavailable
//    on very old browsers; we default to dark.
//
// No React imports here — this module is pure logic so it can also be
// imported by the preload-script generator without dragging React into the
// critical-path bundle.

export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

/** localStorage key. Versioned so we can migrate the storage shape later
 *  (e.g. add per-user themes) without colliding with the v1 string value. */
export const THEME_STORAGE_KEY = "vc-theme-v1";

/** When no signal is available anywhere, we land here. Hand-tuned to match
 *  the CSS token system, which is dark-first. */
const FALLBACK_THEME: ResolvedTheme = "dark";

/** All values we accept from storage. Anything else is treated as missing. */
const VALID_THEMES = new Set<Theme>(["system", "light", "dark"]);

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && VALID_THEMES.has(value as Theme);
}

/** Read the stored preference. Returns "system" when nothing is stored
 *  (i.e. "follow OS"), so callers always get a meaningful value. */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : "system";
  } catch {
    // SecurityError in private mode, or DOMException in some embeds.
    return "system";
  }
}

/** Persist the user's choice. Silent failure if storage is unavailable —
 *  the in-memory state still works for the current session. */
export function setStoredTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode / quota / disabled — non-fatal.
  }
}

/** Detect the current OS-level color-scheme preference. Returns the
 *  fallback if matchMedia isn't available. */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return FALLBACK_THEME;
  }
  // We deliberately check ONLY the dark query. The "no preference" media
  // query was deprecated and most browsers report a default (usually light)
  // even when the user hasn't set one. We treat dark as the explicit signal;
  // everything else falls through to our dark-first fallback only via
  // resolveTheme below.
  try {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
    return FALLBACK_THEME;
  } catch {
    return FALLBACK_THEME;
  }
}

/** Reduce a Theme (which may be "system") to a concrete light|dark. */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") return getSystemTheme();
  return theme;
}

/** Mutate <html> classList to reflect the resolved theme. Idempotent. */
export function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  // Set the standard `color-scheme` so native form controls, scrollbars,
  // and the `<canvas>` default backdrop all pick the right palette. This
  // is what fixes the white-flash on native datepickers under dark mode.
  root.style.colorScheme = resolved;
}

/** Subscribe to system-preference changes. The callback fires with the
 *  NEW resolved system theme whenever the user changes OS appearance.
 *  Returns an unsubscribe. */
export function subscribeToSystemTheme(callback: (next: ResolvedTheme) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => callback(e.matches ? "dark" : "light");
  // Safari < 14 only supports the legacy addListener API. Modern browsers
  // expose addEventListener as well; prefer it.
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }
  mq.addListener(handler);
  return () => mq.removeListener(handler);
}

/** Subscribe to storage events — fires when ANOTHER tab updates the theme
 *  (the `storage` event does not fire in the originating tab). Returns
 *  an unsubscribe. */
export function subscribeToStorageTheme(callback: (next: Theme) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    callback(isTheme(e.newValue) ? e.newValue : "system");
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
