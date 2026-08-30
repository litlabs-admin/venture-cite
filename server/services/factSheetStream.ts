// Brand Fact Sheet SSE stream service (v1 run-progress stream).
//
// Extracted verbatim from server/routes/factSheet.ts's
// GET /api/brand-fact-sheet/runs/:runId/stream handler (phase B7-16).
//
// The stream handler itself stays in the route: it owns the SSE framing
// (headers, heartbeat interval, req.on("close") abort tracking, the slice
// budget deadline, res.write/res.end). What moved here is the part that
// decides WHAT to emit each tick - fetching the delta since the last cursor
// and shaping it into wire payloads. No Express types, no req/res.

import { storage } from "../storage";

// Reconnect cursor format: "<lastPageId>:<lastFactId>" (both ascending row
// ids). Both halves optional; an empty half = -infinity (replay from start).
export function parseLastEventId(raw: string | undefined): {
  lastPageId: string;
  lastFactId: string;
} {
  if (!raw) return { lastPageId: "", lastFactId: "" };
  const [p = "", f = ""] = raw.split(":");
  return { lastPageId: p, lastFactId: f };
}

export async function getNewFactSheetPages(
  runId: string,
  lastPageId: string,
): Promise<{
  events: Array<{
    id: unknown;
    url: unknown;
    status: unknown;
    factCount: unknown;
    bytes: unknown;
    errorKind: unknown;
    lang: unknown;
  }>;
  lastPageId: string;
}> {
  const pages = await storage.listScrapePagesForRun(runId);
  const events: Array<{
    id: unknown;
    url: unknown;
    status: unknown;
    factCount: unknown;
    bytes: unknown;
    errorKind: unknown;
    lang: unknown;
  }> = [];
  let cursor = lastPageId;
  for (const p of pages) {
    const pid = String((p as any).id);
    if (cursor === "" || pid > cursor) {
      events.push({
        id: (p as any).id,
        url: (p as any).url,
        status: (p as any).status,
        factCount: (p as any).factCount ?? 0,
        bytes: (p as any).bytes ?? null,
        errorKind: (p as any).errorKind ?? null,
        lang: (p as any).lang ?? null,
      });
      cursor = pid;
    }
  }
  return { events, lastPageId: cursor };
}

export async function getNewFactSheetFacts(
  runId: string,
  lastFactId: string,
): Promise<{
  events: Array<{
    id: unknown;
    domain: unknown;
    subcategory: unknown;
    factKey: unknown;
    factValue: unknown;
    valueType: unknown;
    valuePayload: unknown;
    confidence: unknown;
    sourceUrl: unknown;
    sourceExcerpt: unknown;
  }>;
  lastFactId: string;
}> {
  const facts = await storage.listFactsByRunIdSince(runId, lastFactId || null, 100);
  const events: Array<{
    id: unknown;
    domain: unknown;
    subcategory: unknown;
    factKey: unknown;
    factValue: unknown;
    valueType: unknown;
    valuePayload: unknown;
    confidence: unknown;
    sourceUrl: unknown;
    sourceExcerpt: unknown;
  }> = [];
  let cursor = lastFactId;
  for (const f of facts) {
    events.push({
      id: (f as any).id,
      domain: (f as any).domain,
      subcategory: (f as any).subcategory,
      factKey: (f as any).factKey,
      factValue: (f as any).factValue,
      valueType: (f as any).valueType,
      valuePayload: (f as any).valuePayload,
      confidence: (f as any).confidence,
      sourceUrl: (f as any).sourceUrl,
      sourceExcerpt: (f as any).sourceExcerpt,
    });
    cursor = String((f as any).id);
  }
  return { events, lastFactId: cursor };
}

// Emit one event per v2 source (user_enrich, static_pages, search_llm)
// whenever a log row exists for that source. We read the full log list each
// tick and keep the latest entry per source, so clients always see the
// most-recent status even if an earlier tick was missed.
export async function getFactSheetSourceUpdateEvents(runId: string): Promise<
  Array<{
    source: string;
    status: "done" | "failed" | "in_progress";
    facts: number;
    errorKind: string | null;
  }>
> {
  const logs = await storage.listFactScrapeLogsForRun(runId);
  const bySource = new Map<string, (typeof logs)[number]>();
  for (const l of logs) bySource.set(l.source, l);

  const sourceMapping = [
    { dbSource: "user_enrich", emit: "userEnrich" },
    { dbSource: "static_pages", emit: "staticPages" },
    { dbSource: "search_llm", emit: "searchLlm" },
  ] as const;

  const payloads: Array<{
    source: string;
    status: "done" | "failed" | "in_progress";
    facts: number;
    errorKind: string | null;
  }> = [];
  for (const m of sourceMapping) {
    const latest = bySource.get(m.dbSource);
    if (latest) {
      payloads.push({
        source: m.emit,
        status:
          latest.status === "done" ? "done" : latest.status === "failed" ? "failed" : "in_progress",
        facts: latest.factCount,
        errorKind: latest.errorKind,
      });
    }
  }
  return payloads;
}
