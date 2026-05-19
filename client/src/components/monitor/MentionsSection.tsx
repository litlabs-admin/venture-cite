// client/src/components/monitor/MentionsSection.tsx
//
// Recent brand mentions section. Wraps the existing MentionsTab component
// (which already handles scan status, filters, list, MentionDetailSheet).
// We do not rebuild Mentions — we just place it inside the canvas with a
// minimal section header. Preserves MentionDetailSheet flow + ?mention= URL.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MentionsTab from "@/components/geo-tools/MentionsTab";

export default function MentionsSection({ brandId }: { brandId: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mentions</CardTitle>
      </CardHeader>
      <CardContent>
        <MentionsTab brandId={brandId} />
      </CardContent>
    </Card>
  );
}
