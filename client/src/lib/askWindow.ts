// client/src/lib/askWindow.ts
//
// Imperative "open the Ask window" signal (CommandPalette.tsx). The sidebar's
// Ask pill (Sidebar.tsx) needs to open it too, but the open/closed state
// lives in AppShell - the sidebar's nearest common ancestor with the window
// itself - so a window event is cheaper here than threading a context down
// through both the desktop <aside> and the mobile Sheet. Same pattern as
// openChatbotPrompt.ts and askComposerFocus.ts.

export const ASK_OPEN_WINDOW_EVENT = "venturecite:open-ask-window";

export function openAskWindow(): void {
  window.dispatchEvent(new CustomEvent(ASK_OPEN_WINDOW_EVENT));
}
