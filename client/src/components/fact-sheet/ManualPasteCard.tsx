import { useState } from "react";
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
    <div data-testid="manual-paste-card">
      <div className="mb-4">
        <h3 className="text-ui font-semibold">We couldn't read your site automatically</h3>
        <p className="mt-1 text-caption text-muted-foreground">
          Some sites block automated readers, or content is rendered in a way we can't reach. Paste
          your About text below and we'll do the rest.
        </p>
      </div>
      <div className="space-y-3">
        <Textarea
          rows={12}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your About / homepage / company description here..."
          className="font-mono text-caption"
          maxLength={50_000}
        />
        <div className="text-caption text-muted-foreground">
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
      </div>
    </div>
  );
}
