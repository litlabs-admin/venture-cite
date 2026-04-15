import { Badge } from "@/components/ui/badge";
import { FlaskConical } from "lucide-react";
import { useServerConfig } from "@/hooks/use-server-config";

// Small amber badge that renders only when the server reports testMode=true.
// Drop anywhere near a Generate/Run button to signal that the cheap test
// model (gpt-5-nano) is active so quality may differ from production.
export function TestModeBadge({ className = "" }: { className?: string }) {
  const { data } = useServerConfig();
  if (!data?.data?.testMode) return null;
  return (
    <Badge
      variant="outline"
      className={`bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800 ${className}`}
      data-testid="badge-test-mode"
    >
      <FlaskConical className="w-3 h-3 mr-1" />
      Test Mode
    </Badge>
  );
}
