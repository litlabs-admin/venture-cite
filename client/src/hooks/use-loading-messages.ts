import { useState, useEffect } from "react";

/**
 * Cycles through an array of loading messages while `isLoading` is true.
 * Resets to the first message when loading stops.
 * Use this to replace static spinners with contextual progress text.
 */
export function useLoadingMessages(
  isLoading: boolean,
  messages: string[],
  intervalMs = 3000
): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % messages.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isLoading, messages.length, intervalMs]);

  return messages[index] ?? messages[0] ?? "";
}
