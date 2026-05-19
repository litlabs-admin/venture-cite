import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function MissingSchemaInspector({
  url,
  missing,
  recommendedSnippet,
}: {
  url: string;
  missing: string[];
  recommendedSnippet: string | null;
}) {
  const { toast } = useToast();
  function copy() {
    if (!recommendedSnippet) return;
    navigator.clipboard.writeText(recommendedSnippet);
    toast({ title: "Copied to clipboard" });
  }
  return (
    <div className="p-4 space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Missing schema</p>
        <h2 className="text-base font-medium mt-1">{url}</h2>
        <p className="text-xs text-muted-foreground mt-1">Missing: {missing.join(", ")}</p>
      </header>
      {recommendedSnippet ? (
        <>
          <pre className="text-xs bg-muted/30 p-3 rounded whitespace-pre-wrap font-mono">
            {recommendedSnippet}
          </pre>
          <Button size="sm" onClick={copy}>
            Copy snippet
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Add the schema types above to your page&apos;s JSON-LD block.
        </p>
      )}
    </div>
  );
}
