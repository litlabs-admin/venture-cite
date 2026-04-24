interface VerbatimResponseCardProps {
  platform?: string | null;
  prompt?: string | null;
  response: string;
  heading?: string;
}

export default function VerbatimResponseCard({
  platform,
  prompt,
  response,
  heading,
}: VerbatimResponseCardProps) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-4">
      {heading && (
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{heading}</div>
      )}
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-semibold">
          AI
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">{response}</p>
          {(platform || prompt) && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {platform && (
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                  {platform}
                </span>
              )}
              {prompt && <span className="italic truncate">Q: {prompt}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
