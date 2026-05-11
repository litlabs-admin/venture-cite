// Foundations Plan 4 Task 4: small disclosure pill mounted on article
// surfaces whose body was produced by the content-generation worker. The
// `aiGenerated` flag is set by storage.setArticleReady; manual creates
// stay false and so render nothing.

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function AIGeneratedPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
      aria-label="AI-generated content"
      data-testid="ai-generated-pill"
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      AI-generated
    </span>
  );
}

export default AIGeneratedPill;
