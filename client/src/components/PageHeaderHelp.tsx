// client/src/components/PageHeaderHelp.tsx
import { HelpCircle } from "lucide-react";
import { Button } from "./ui/button";
import { useTourReplay } from "../hooks/useTourReplay";
import { getTour } from "../tours/registry";
import { openChatbotPrompt } from "../lib/openChatbotPrompt";
import { isTourEngineEnabled } from "../tours/engine/featureFlag";

interface Props {
  tourId?: string;
  pageLabel: string;
}

export function PageHeaderHelp({ tourId, pageLabel }: Props) {
  const replay = useTourReplay();
  const hasTour = tourId ? !!getTour(tourId) : false;

  if (!isTourEngineEnabled()) return null;

  const onClick = () => {
    if (hasTour && tourId) {
      replay(tourId);
    } else {
      openChatbotPrompt(`Explain the ${pageLabel} page in VentureCite.`);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={hasTour ? `Replay ${pageLabel} tour` : `Ask the AI tutor about ${pageLabel}`}
      onClick={onClick}
      data-tour-id="page.help"
    >
      <HelpCircle className="h-5 w-5" />
    </Button>
  );
}
