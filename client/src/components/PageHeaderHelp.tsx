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
  // The help affordance must exist in BOTH flag states. With the tour
  // engine on and a tour for this page, it replays that tour. With the
  // engine off (or no tour registered), the orchestrator never installs
  // the replay bridge, so it falls back to the in-app AI tutor — the
  // button never just disappears.
  const canReplay = isTourEngineEnabled() && !!tourId && !!getTour(tourId);

  const onClick = () => {
    if (canReplay && tourId) {
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
      aria-label={canReplay ? `Replay ${pageLabel} tour` : `Ask the AI tutor about ${pageLabel}`}
      onClick={onClick}
      data-tour-id="page.help"
    >
      <HelpCircle className="h-5 w-5" />
    </Button>
  );
}
