import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function CrawlerBlockInspector({
  botName,
  url,
  recommendation,
}: {
  botName: string;
  url: string;
  recommendation: string | null;
}) {
  const { toast } = useToast();
  function copy() {
    if (!recommendation) return;
    navigator.clipboard.writeText(recommendation);
    toast({ title: "Copied to clipboard" });
  }
  return (
    <div className="p-4 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Crawler blocked</p>
        <h2 className="text-lg font-semibold mt-1">{botName}</h2>
        <p className="text-xs text-muted-foreground mt-1">on {url}</p>
      </header>
      {recommendation ? (
        <>
          <pre className="text-xs bg-muted/30 p-3 rounded whitespace-pre-wrap font-mono">
            {recommendation}
          </pre>
          <Button size="sm" onClick={copy}>
            Copy snippet
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          To unblock {botName}, allow its user-agent in robots.txt.
        </p>
      )}
    </div>
  );
}
