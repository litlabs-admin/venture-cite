import { useState, useCallback } from "react";

/**
 * Like useState but persisted to localStorage. Reads from storage on first
 * render and writes on every setState. Falls back to defaultValue when
 * storage is empty or corrupt.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, (val: T | ((prev: T) => T)) => void] {
  const [state, setStateRaw] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return defaultValue;
      return JSON.parse(stored) as T;
    } catch {
      return defaultValue;
    }
  });

  const setState = useCallback(
    (val: T | ((prev: T) => T)) => {
      setStateRaw((prev) => {
        const next = typeof val === "function" ? (val as (prev: T) => T)(prev) : val;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage full or unavailable — silently ignore
        }
        return next;
      });
    },
    [key],
  );

  return [state, setState];
}
