import { useEffect, useRef, useState } from "react";

// RAF-driven count-up, cubic ease-out (1-(1-t)^3), default duration 600ms -
// verified against assets/useAnimatedNumber-Cg_7h-09.js. Respects
// prefers-reduced-motion by jumping straight to the end value. Returns the
// raw animated number; callers handle their own rounding/formatting since
// different stats want different precision (Math.round, toFixed, commas).
export function useCountUp(target: number, { start = false, duration = 600 } = {}) {
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!start) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [start, target, duration]);

  return value;
}
