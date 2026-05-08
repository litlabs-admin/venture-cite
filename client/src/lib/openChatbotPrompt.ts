// client/src/lib/openChatbotPrompt.ts
//
// Imperative entry point for opening the chatbot with a pre-filled prompt.
// Used by PageHeaderHelp on routes without a dedicated tour.

const EVENT = "venturecite:open-chatbot-prompt";

export function openChatbotPrompt(prompt: string): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { prompt } }));
}

export function subscribeOpenChatbotPrompt(handler: (prompt: string) => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail as { prompt?: string } | undefined;
    if (detail?.prompt) handler(detail.prompt);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
