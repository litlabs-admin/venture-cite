// Aggregate logic. Two exports:
//   - computeTerminalStatus: pure function over source outcomes
//   - runAggregate: full IO orchestration (called from the route + cron)
//
// Run-level rules (Spec §8.4):
//   - Any source returned ≥1 fact → 'completed'
//   - Zero facts AND any source had a content error (not provider) →
//     'failed' with errorKind='all_sources_empty'
//   - Zero facts AND all sources had provider errors →
//     'failed' with errorKind='provider_outage'
//
// Reconciliation (within the SERIALIZABLE transaction):
//   1. Delete scraped rows for this brand from previous runs (only this
//      run's scraped facts survive).
//   2. For each user/user_manual fact in this brand, check if any scraped
//      fact has the same (domain, subcategory, factKey) with a different
//      factValue. If so, increment disagreement_count on the user/manual row.
//   3. Bump last_verified on every brand_fact_sheet row touched by this run.
//
// NOTE: db, storage, and logger are imported lazily inside runAggregate so
// that this module can be loaded in unit tests without a DATABASE_URL env var.
// computeTerminalStatus has no side effects and needs none of those.

export interface SourceOutcome {
  source: "static_pages" | "search_llm" | "user_enrich" | "aggregate" | "paste";
  status: "done" | "failed" | "skipped";
  factCount: number;
  errorKind: string | null;
}

export type TerminalStatus =
  | { status: "completed"; errorKind: null }
  | { status: "failed"; errorKind: "all_sources_empty" | "provider_outage" };

const PROVIDER_ERRORS = new Set(["llm_unavailable", "provider_unconfigured", "fetch_failed"]);

export function computeTerminalStatus(outcomes: SourceOutcome[]): TerminalStatus {
  const total = outcomes.reduce((sum, o) => sum + o.factCount, 0);
  if (total > 0) return { status: "completed", errorKind: null };
  const allProviderErrors =
    outcomes.length > 0 &&
    outcomes.every((o) => o.errorKind !== null && PROVIDER_ERRORS.has(o.errorKind));
  return {
    status: "failed",
    errorKind: allProviderErrors ? "provider_outage" : "all_sources_empty",
  };
}

export interface RunAggregateArgs {
  runId: string;
  brandId: string;
}

export interface AggregateResult {
  status: TerminalStatus["status"];
  errorKind: TerminalStatus["errorKind"];
  totalFacts: number;
  disagreementsIncremented: number;
}

export async function runAggregate(args: RunAggregateArgs): Promise<AggregateResult> {
  // Lazy imports: avoids DATABASE_URL check at module load time.
  const [{ db }, { and, eq, ne, sql }, schemaModule, { logger }, { storage }] = await Promise.all([
    import("../../../db"),
    import("drizzle-orm"),
    import("@shared/schema"),
    import("../../logger"),
    import("../../../storage"),
  ]);
  const schema = schemaModule;

  // 1. Pull source outcomes from fact_scrape_logs.
  const logRows = await db
    .select({
      source: schema.factScrapeLogs.source,
      status: schema.factScrapeLogs.status,
      factCount: schema.factScrapeLogs.factCount,
      errorKind: schema.factScrapeLogs.errorKind,
    })
    .from(schema.factScrapeLogs)
    .where(eq(schema.factScrapeLogs.runId, args.runId));

  const outcomes: SourceOutcome[] = logRows.map((r) => ({
    source: r.source as SourceOutcome["source"],
    status: r.status as SourceOutcome["status"],
    factCount: r.factCount ?? 0,
    errorKind: r.errorKind,
  }));

  const terminal = computeTerminalStatus(outcomes);

  // 2. SERIALIZABLE transaction for reconciliation.
  let disagreementsIncremented = 0;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);

    // 2a. Delete scraped rows from previous runs (keep only this run's).
    await tx
      .delete(schema.brandFactSheet)
      .where(
        and(
          eq(schema.brandFactSheet.brandId, args.brandId),
          eq(schema.brandFactSheet.source, "scraped"),
          ne(schema.brandFactSheet.runId, args.runId),
        ),
      );

    // 2b. Increment disagreement_count on user/user_manual rows where a
    //     scraped row from THIS run exists with the same
    //     (domain, subcategory, factKey) but a different fact_value.
    const updateResult = await tx.execute(sql`
      UPDATE brand_fact_sheet AS u
      SET disagreement_count = u.disagreement_count + 1
      WHERE u.brand_id = ${args.brandId}
        AND u.source IN ('user','user_manual')
        AND EXISTS (
          SELECT 1 FROM brand_fact_sheet AS s
          WHERE s.brand_id = u.brand_id
            AND s.source = 'scraped'
            AND s.run_id = ${args.runId}
            AND s.domain = u.domain
            AND s.subcategory = u.subcategory
            AND s.fact_key = u.fact_key
            AND s.fact_value <> u.fact_value
        )
    `);
    disagreementsIncremented =
      (updateResult as unknown as { rowCount: number | null }).rowCount ?? 0;

    // 2c. Bump last_verified on every row touched by this brand.
    await tx.execute(sql`
      UPDATE brand_fact_sheet
      SET last_verified = now()
      WHERE brand_id = ${args.brandId}
        AND (
          (source = 'scraped' AND run_id = ${args.runId})
          OR source IN ('user','user_manual')
        )
    `);
  });

  // 3. Count surviving facts for this brand.
  const factRows = await db
    .select({ id: schema.brandFactSheet.id })
    .from(schema.brandFactSheet)
    .where(eq(schema.brandFactSheet.brandId, args.brandId));

  // 4. Mark run terminal.
  await db
    .update(schema.brandFactScrapeRuns)
    .set({
      status: terminal.status,
      errorKind: terminal.errorKind,
      completedAt: new Date(),
    })
    .where(eq(schema.brandFactScrapeRuns.id, args.runId));

  // 5. Log the aggregate step itself.
  try {
    await storage.insertFactScrapeLog({
      runId: args.runId,
      source: "aggregate",
      status: terminal.status === "completed" ? "done" : "failed",
      factCount: factRows.length,
      errorKind: terminal.errorKind ?? undefined,
      diagnostics: { disagreementsIncremented, sourcesObserved: outcomes.length },
    });
  } catch (err) {
    logger.warn({ err, runId: args.runId }, "runAggregate: log insert failed (non-fatal)");
  }

  return {
    status: terminal.status,
    errorKind: terminal.errorKind,
    totalFacts: factRows.length,
    disagreementsIncremented,
  };
}
