// client/src/lib/askComposerFocus.ts
//
// Imperative "focus the Ask composer" signal. On /agent, ⌘K and the
// sidebar's Ask pill focus the composer instead of opening the Ask window
// (AppShell.tsx's keydown listener and Sidebar.tsx's Ask entry both check
// the current route and call this instead). Same shape as
// openChatbotPrompt.ts's window-event pattern, for the same reason: the
// dispatcher (AppShell/Sidebar) and the listener (AskWorkspace) don't share
// a common ancestor that could hold this in ordinary React state.

export const ASK_FOCUS_COMPOSER_EVENT = "venturecite:ask-focus-composer";

export function focusAskComposer(): void {
  window.dispatchEvent(new CustomEvent(ASK_FOCUS_COMPOSER_EVENT));
}
