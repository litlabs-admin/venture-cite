import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Plain twMerge only knows Tailwind's built-in font-size scale (text-sm,
// text-lg, ...), so it doesn't dedupe against the app's named type-scale
// tokens (text-hero..text-label, defined in index.css's @theme block) -
// both classes survive and whichever lands later in the compiled
// stylesheet wins, silently ignoring the override. Extending the
// `font-size` class group here fixes every call site at once instead of
// requiring text-[Npx] workarounds wherever a named-scale class overrides
// a component's own baked-in text-size class (e.g. Label, Table).
const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-hero",
        "text-stat",
        "text-metric",
        "text-page",
        "text-section",
        "text-dialog",
        "text-ui",
        "text-body",
        "text-caption",
        "text-data",
        "text-label",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs));
}
