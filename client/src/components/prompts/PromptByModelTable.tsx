import { AI_PLATFORMS_ACTIVE } from "@shared/constants";
import type { PlatformResultShape } from "@/hooks/usePrompts";

// One row per each of the 6 REAL wired platforms (server/lib/modelConfig.ts
// CITATION_MODELS) - never a placeholder row for Meta AI / Google AI
// Overviews, which this app can't reach the same way (see the teardown's
// "Missing 2 platforms" decision, reconfirmed when trakkr's 8-platform
// table was compared against this one).
export function PromptByModelTable({
  byPlatform,
  rankMovement,
}: {
  byPlatform: Record<string, PlatformResultShape>;
  /** Per-platform rank movement from usePromptScoreHistory's byPlatform -
   *  computed there already (server/lib/promptScoreHistory.ts), not
   *  reimplemented here. */
  rankMovement?: Record<string, { rankDelta: number | null; isNew: boolean }>;
}) {
  return (
    <div className="divide-y divide-vc-default border-t border-vc-default">
      {AI_PLATFORMS_ACTIVE.map((platform) => {
        const r = byPlatform[platform];
        const movement = rankMovement?.[platform];
        return (
          <div
            key={platform}
            className="grid grid-cols-[160px_56px_56px_minmax(0,1fr)] items-center gap-3 px-8 py-3"
          >
            <span className="text-caption font-medium text-vc-primary">{platform}</span>
            {!r ? (
              <>
                <span className="text-data text-vc-hover">–</span>
                <span />
                <span className="text-data text-vc-tertiary">Not checked yet</span>
              </>
            ) : !r.isCited ? (
              <>
                <span className="text-data text-vc-hover">–</span>
                <span />
                {r.topAnswers && r.topAnswers.length > 0 ? (
                  <div className="min-w-0">
                    <p className="mb-0.5 text-label text-vc-tertiary">
                      Not cited - competitors named instead:
                    </p>
                    <TopAnswers answers={r.topAnswers} />
                  </div>
                ) : (
                  <span className="text-data text-vc-tertiary">Not cited in the latest check</span>
                )}
              </>
            ) : (
              <>
                <span className="font-mono text-data tabular-nums text-vc-primary">
                  {r.rank ? `#${r.rank}` : "Cited"}
                </span>
                <RankDelta movement={movement} />
                {r.topAnswers && r.topAnswers.length > 0 ? (
                  <TopAnswers answers={r.topAnswers} />
                ) : (
                  <span
                    className="truncate text-data text-vc-tertiary"
                    title={r.snippet ?? undefined}
                  >
                    {r.snippet ?? "Cited, no excerpt captured"}
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RankDelta({ movement }: { movement?: { rankDelta: number | null; isNew: boolean } }) {
  if (!movement || (movement.rankDelta === null && !movement.isNew)) {
    return <span className="text-data text-vc-hover">–</span>;
  }
  if (movement.isNew) {
    return (
      <span className="text-label font-semibold uppercase tracking-wide text-vc-accent">New</span>
    );
  }
  const delta = movement.rankDelta!;
  // rankDelta = latest.rank - prior.rank (promptScoreHistory.ts convention):
  // negative means the rank NUMBER dropped, i.e. improved (#5 -> #2).
  if (delta === 0) return <span className="text-data text-vc-tertiary">–</span>;
  const improved = delta < 0;
  return (
    <span
      className={`font-mono text-data tabular-nums ${improved ? "text-positive" : "text-destructive"}`}
    >
      {improved ? "▲" : "▼"} {Math.abs(delta)}
    </span>
  );
}

function TopAnswers({ answers }: { answers: { name: string; isBrand: boolean }[] }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-data">
      {answers.map((a, i) => (
        <span
          key={`${a.name}-${i}`}
          className={
            a.isBrand
              ? "rounded bg-vc-accent-subtle px-1 font-medium text-vc-accent"
              : "text-vc-tertiary"
          }
        >
          {i + 1} {a.name}
        </span>
      ))}
    </span>
  );
}
