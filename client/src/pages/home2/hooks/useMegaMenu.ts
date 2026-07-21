import { useCallback, useEffect, useRef, useState } from "react";

const CLOSE_DELAY_MS = 150;

// Verified against _reference/assets/TrakkrNav-JAUeEuWq.js: hover opens
// immediately, mouse-leave schedules a close after 150ms, focus also opens,
// blur-outside-container and Escape close immediately.
export function useMegaMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closeTimeout.current) clearTimeout(closeTimeout.current);
    },
    [],
  );

  const open = useCallback(() => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    setIsOpen(true);
  }, []);

  const scheduleClose = useCallback(() => {
    closeTimeout.current = setTimeout(() => setIsOpen(false), CLOSE_DELAY_MS);
  }, []);

  const closeNow = useCallback(() => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    setIsOpen(false);
  }, []);

  const containerProps = {
    onMouseEnter: open,
    onMouseLeave: scheduleClose,
    onFocus: open,
    onBlur: (e: React.FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) closeNow();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") closeNow();
    },
  };

  return { isOpen, containerProps, open, closeNow };
}
