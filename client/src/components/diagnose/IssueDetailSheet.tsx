// client/src/components/diagnose/IssueDetailSheet.tsx
//
// Branches on issue.type and mounts the right per-type Inspector body.
// The hallucination case reuses the existing 4b correction Inspector
// byte-identically.

import type { Issue } from "@shared/diagnoseTypes";
import type { BrandHallucination } from "@shared/schema";
import HallucinationDetail from "@/components/intelligence/HallucinationDetail";
import ListicleGapInspector from "./inspectors/ListicleGapInspector";
import WikipediaGapInspector from "./inspectors/WikipediaGapInspector";
import CrawlerBlockInspector from "./inspectors/CrawlerBlockInspector";
import WeakSignalInspector from "./inspectors/WeakSignalInspector";
import MissingSchemaInspector from "./inspectors/MissingSchemaInspector";

export default function IssueDetailSheet({ issue }: { issue: Issue }) {
  switch (issue.type) {
    case "hallucination": {
      // The server aggregator (Task 20) puts the hallucination row into
      // metadata.hallucination. Pass it as the 4b Inspector's `hal` prop.
      const meta = (issue.metadata as Record<string, unknown>) ?? {};
      const hal =
        (meta.hallucination as BrandHallucination | undefined) ??
        ({
          id: meta.hallucinationId as string | undefined,
        } as BrandHallucination);
      return <HallucinationDetail hal={hal} />;
    }
    case "listicle_gap":
      return (
        <ListicleGapInspector
          listicleId={String((issue.metadata as Record<string, unknown>).listicleId)}
        />
      );
    case "wikipedia_gap":
      return (
        <WikipediaGapInspector
          mentionId={String((issue.metadata as Record<string, unknown>).mentionId)}
        />
      );
    case "crawler_block": {
      const meta = issue.metadata as Record<string, unknown>;
      return (
        <CrawlerBlockInspector
          botName={String(meta.botName)}
          url={String(meta.url)}
          recommendation={(meta.recommendation as string | null) ?? null}
        />
      );
    }
    case "weak_signal":
      return (
        <WeakSignalInspector
          signalRunId={String((issue.metadata as Record<string, unknown>).signalRunId)}
        />
      );
    case "missing_schema": {
      const meta = issue.metadata as Record<string, unknown>;
      return (
        <MissingSchemaInspector
          url={String(meta.url)}
          missing={(meta.missing as string[]) ?? []}
          recommendedSnippet={(meta.recommendedSnippet as string | null) ?? null}
        />
      );
    }
    case "stale_article":
      // stale_article never opens an Inspector — ctaHref takes user to /content/:id.
      return null;
    default:
      return null;
  }
}
