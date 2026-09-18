// A brief, brand-coloured confirmation at the bottom centre of the screen -
// distinct from the app's generic top/bottom-right Toaster
// (components/ui/toast.tsx), which is a neutral notification surface, not a
// "you just did a thing here" micro-interaction. Used by MemoryTab after a
// save/forget, and reusable anywhere else in Ask that wants the same beat.
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type AskContextToastState = { key: number; message: string } | null;

const AUTO_DISMISS_MS = 2600;

export function AskContextToast({
  toast,
  onDone,
}: {
  toast: AskContextToastState;
  onDone: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const dismiss = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    // The fade-out transition (200ms, see className below) needs to finish
    // before unmounting, or the exit animation never gets seen.
    const remove = setTimeout(onDone, AUTO_DISMISS_MS + 200);
    return () => {
      clearTimeout(dismiss);
      clearTimeout(remove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.key]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-8 z-[70] flex justify-center px-4"
    >
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-caption font-medium text-primary-foreground shadow-lg transition-all duration-200 ease-out motion-reduce:transition-opacity",
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-2 scale-95 opacity-0 motion-reduce:translate-y-0 motion-reduce:scale-100",
        )}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-foreground/20">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
        {toast.message}
      </div>
    </div>
  );
}
