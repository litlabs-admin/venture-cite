import { useEffect, useRef, useState } from "react";

// Verified against assets/Landing-DwcjvtMm.js: every section watches its own
// element via IntersectionObserver({ threshold: 0, rootMargin: "0px 0px -40% 0px" }),
// plus a synchronous getBoundingClientRect() check first so elements already
// in view on load reveal immediately rather than waiting for a scroll event.
// One-shot: once revealed, stays revealed (observer disconnects).
//
// Usage: attach `ref` to the section's outer element, use `isVisible` to
// toggle each child between its opacity-0/translate-y-8 start classes and
// opacity-100/translate-y-0, with transition-all duration-700 and the shared
// easing cubic-bezier(0.16, 1, 0.3, 1) - stagger children with an inline
// transitionDelay of roughly `${index * 100}ms`.
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0, rootMargin: "0px 0px -40% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

export const scrollRevealEase = "cubic-bezier(0.16, 1, 0.3, 1)";
