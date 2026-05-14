import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface Props {
  runId: string;
  onSubmit: (text: string) => void;
  onManualFill: () => void;
  busy?: boolean;
}

export function ManualPasteCard({ runId: _runId, onSubmit, onManualFill, busy }: Props) {
  const [text, setText] = useState("");
  const valid = text.length > 0 && text.length <= 50_000;

  return (
    <Card data-testid="manual-paste-card">
      <CardHeader>
        <CardTitle>We couldn't read your site automatically</CardTitle>
        <CardDescription>
          Some sites block automated readers, or content is rendered in a way we can't reach. Paste
          your About text below and we'll do the rest.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your About / homepage / company description here..."
          className="font-mono text-sm"
          maxLength={50_000}
        />
        <div className="text-xs text-muted-foreground">
          {text.length.toLocaleString()} / 50,000 characters
        </div>
        <div className="flex gap-2">
          <Button onClick={() => onSubmit(text)} disabled={!valid || busy}>
            Submit
          </Button>
          <Button variant="ghost" onClick={onManualFill} disabled={busy}>
            Or fill fields manually
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
