import { Sparkles, Lightbulb, Compass, AlertCircle, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

const STARTERS = [
  {
    icon: Lightbulb,
    category: "Concepts",
    prompt: "What's the difference between GEO, AEO, and SEO?",
  },
  {
    icon: Compass,
    category: "How-to",
    prompt: "How do I get started with VentureCite?",
  },
  {
    icon: AlertCircle,
    category: "Troubleshoot",
    prompt: "Why aren't my citations showing up yet?",
  },
  {
    icon: Wrench,
    category: "Strategy",
    prompt: "How should I use Reddit for AEO?",
  },
];

export function WelcomeState({
  onPick,
  brandName,
}: {
  onPick: (text: string) => void;
  brandName: string | null;
}) {
  return (
    <div className="flex flex-col items-center text-center pt-6 pb-2">
      <div className="rounded-full bg-gradient-to-br from-primary/20 to-primary/5 p-4 mb-3 ring-1 ring-primary/10">
        <Sparkles className="h-7 w-7 text-primary" />
      </div>
      <h3 className="text-base font-semibold">Hey 👋 I'm your VentureCite tutor</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-[280px]">
        I help you understand GEO/AEO/SEO and run the playbooks inside this product.
        {brandName ? ` Right now I'm tuned to ${brandName}.` : ""}
      </p>

      <div className="mt-6 w-full grid grid-cols-2 gap-2">
        {STARTERS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.prompt}
              onClick={() => onPick(s.prompt)}
              className={cn(
                "group text-left rounded-lg border bg-card p-3",
                "hover:border-primary/40 hover:bg-accent/50 transition-colors",
              )}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                <Icon className="h-3 w-3" aria-hidden />
                {s.category}
              </div>
              <div className="text-xs mt-1 leading-snug text-foreground/90 line-clamp-3">
                {s.prompt}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
