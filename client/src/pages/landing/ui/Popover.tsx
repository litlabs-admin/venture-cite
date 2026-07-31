import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

// Generic popover/tooltip primitive. Verified against
// assets/Popover-DarEciA7.js: NOT built on Radix or Floating UI - this is a
// from-scratch reimplementation of that same approach: manual positioning
// via getBoundingClientRect(), a bottom<->top collision flip against an 8px
// viewport gutter, and a default 8px offset from the anchor. The mount/
// unmount transition is the one legitimate framer-motion use on the page:
// duration 0.18s, ease [0.16, 1, 0.3, 1].

const EASE = [0.16, 1, 0.3, 1] as const;
const VIEWPORT_GUTTER = 8;
const DEFAULT_OFFSET = 8;

type Placement = "bottom" | "top";

interface Coords {
  top: number;
  left: number;
  placement: Placement;
}

export interface PopoverProps<T extends HTMLElement = HTMLElement> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Element the popover is positioned relative to. */
  anchorRef: RefObject<T | null>;
  children: ReactNode;
  className?: string;
  /** Gap between the anchor and the popover, in px. Defaults to 8px. */
  offset?: number;
  role?: string;
  ariaLabel?: string;
}

export function Popover<T extends HTMLElement = HTMLElement>({
  open,
  onOpenChange,
  anchorRef,
  children,
  className,
  offset = DEFAULT_OFFSET,
  role = "dialog",
  ariaLabel,
}: PopoverProps<T>) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const anchorRect = anchor.getBoundingClientRect();
      const popoverEl = popoverRef.current;
      const popoverHeight = popoverEl?.offsetHeight ?? 0;
      const popoverWidth = popoverEl?.offsetWidth ?? 0;

      let placement: Placement = "bottom";
      let top = anchorRect.bottom + offset;

      // Collision flip: bottom -> top when the popover would overflow the
      // bottom viewport edge (respecting an 8px gutter), but only flip if
      // there's actually room above.
      if (top + popoverHeight > window.innerHeight - VIEWPORT_GUTTER) {
        const flippedTop = anchorRect.top - offset - popoverHeight;
        if (flippedTop >= VIEWPORT_GUTTER) {
          placement = "top";
          top = flippedTop;
        }
      }

      let left = anchorRect.left;
      if (left + popoverWidth > window.innerWidth - VIEWPORT_GUTTER) {
        left = window.innerWidth - VIEWPORT_GUTTER - popoverWidth;
      }
      if (left < VIEWPORT_GUTTER) left = VIEWPORT_GUTTER;

      setCoords({ top: top + window.scrollY, left: left + window.scrollX, placement });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, anchorRef, offset]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onOpenChange(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, anchorRef, onOpenChange]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && coords && (
        <motion.div
          ref={popoverRef}
          role={role}
          aria-label={ariaLabel}
          initial={{ opacity: 0, y: coords.placement === "bottom" ? -4 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: coords.placement === "bottom" ? -4 : 4 }}
          transition={{ duration: 0.18, ease: EASE }}
          style={{ position: "absolute", top: coords.top, left: coords.left, zIndex: 60 }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
