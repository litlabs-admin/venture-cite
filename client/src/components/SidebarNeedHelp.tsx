import { Calendar, ArrowRight } from "lucide-react";
import { CALENDLY_BOOKING_URL } from "@/lib/calendly";

// "Need help with PR?" - sits directly above the Getting-started card in the
// sidebar and opens the Calendly scheduler.
//
// Deliberately a real <a> rather than a button with a click handler: it is a
// plain navigation to an external page, so middle-click, ctrl-click and
// "copy link address" all behave the way people expect. rel="noreferrer" is
// required alongside target="_blank" - without noopener the opened page gets
// a handle on window.opener and can navigate this tab.
//
// Styling mirrors SidebarOnboarding's own card (same border, radius, padding,
// hover treatment) so the two read as one stack rather than two unrelated
// widgets.
export default function SidebarNeedHelp({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <a
      href={CALENDLY_BOOKING_URL}
      target="_blank"
      rel="noreferrer noopener"
      onClick={onNavigate}
      className="group block w-full rounded-lg border border-vc-default p-3 text-left transition-colors hover:border-vc-hover hover:bg-vc-muted/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      data-testid="sidebar-need-help-pr"
    >
      <div className="mb-1 flex items-center gap-2">
        <Calendar className="h-4 w-4 shrink-0 text-vc-accent" aria-hidden="true" />
        <span className="text-caption font-semibold text-vc-primary">Need help with PR?</span>
        <ArrowRight
          className="ml-auto h-3 w-3 shrink-0 text-vc-label transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
      <p className="text-caption text-vc-secondary">Book a call with our team.</p>
    </a>
  );
}
