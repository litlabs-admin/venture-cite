import { Clock } from "lucide-react";

interface ComingSoonProps {
  featureName: string;
}

export default function ComingSoon({ featureName }: ComingSoonProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Clock className="w-8 h-8 text-muted-foreground" />
          </div>
        </div>
        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground uppercase tracking-wider mb-4">
          Upcoming — Phase 2
        </span>
        <h1 className="text-2xl font-bold text-foreground mb-3">{featureName}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          This feature is part of Phase 2 and is currently in development.
          Head back to the dashboard to use the Phase 1 features available now.
        </p>
      </div>
    </div>
  );
}
