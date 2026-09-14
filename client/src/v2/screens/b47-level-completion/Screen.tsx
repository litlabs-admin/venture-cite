import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Chip } from "@/v2/shared/ui/Chip";
import { LevelBadge } from "@/v2/shared/ui/LevelBadge";
import { Panel } from "@/v2/shared/ui/Panel";
import { V2Icon } from "@/v2/theme/V2Icon";
import { v2Type } from "@/v2/theme/typography";
import type { V2ScreenProps } from "@/v2/contracts/screen";

export type Board47Data = {
  brandId: string;
  mode: "guided" | "expert";
  brand: { name: string };
  completion: {
    level: number;
    levelName: string;
    verifiedWorkPoints: number;
    milestoneLabels: readonly string[];
  };
  nextLevel: { level: number; name: string } | null;
  nextTask: { title: string; points: number } | null;
};

export function Board47Screen({ data }: V2ScreenProps<Board47Data>) {
  const linkSearch = { brandId: data.brandId, mode: data.mode };
  const { completion, nextLevel, nextTask } = data;

  return (
    <div
      className="flex min-h-full min-w-0 flex-col lg:flex-row"
      data-testid="board47-level-completion"
    >
      <main className="min-w-0 flex-1 px-7 py-6 xl:px-8">
        <div className="flex items-start gap-4">
          <LevelBadge
            level={completion.level}
            name=""
            size="lg"
            className="[&>span:last-child]:hidden"
          />
          <div className="min-w-0">
            <h1 className={v2Type.pageTitle}>Level {completion.level} complete</h1>
            <p className={`${v2Type.pageSub} mt-1.5`}>
              {data.brand.name} is building a stronger, more accurate presence.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="board47-metrics">
          <Panel padding="standard">
            <p className={v2Type.statBig}>{completion.verifiedWorkPoints}</p>
            <p className={`${v2Type.meta} mt-1`}>verified work points</p>
          </Panel>
          <Panel padding="standard">
            <p className={v2Type.statBig}>{completion.milestoneLabels.length}</p>
            <p className={`${v2Type.meta} mt-1`}>milestones achieved</p>
          </Panel>
        </div>

        {nextLevel ? (
          <section className="mt-6 border-t border-[var(--v2-line)] pt-5">
            <div className="flex items-center gap-2">
              <V2Icon name="star" size={16} className="text-[color:var(--v2-brand)]" />
              <h2 className={v2Type.bodyStrong}>
                Level {nextLevel.level} · {nextLevel.name} unlocked
              </h2>
            </div>
            <p className={`${v2Type.body} mt-1.5`}>
              Continue to track deeper results and apply guided strategies to strengthen{" "}
              {data.brand.name}&apos;s presence.
            </p>
          </section>
        ) : null}

        <section className="mt-7 border-t border-[var(--v2-line)] pt-5">
          <h2 className={v2Type.sectionTitle}>Milestones achieved</h2>
          {completion.milestoneLabels.length > 0 ? (
            <ul className="mt-3 space-y-2" data-testid="board47-milestone-list">
              {completion.milestoneLabels.map((label) => (
                <li
                  key={label}
                  className="flex items-start gap-2 text-[13.5px] leading-[1.5] text-[color:var(--v2-ink2)]"
                >
                  <V2Icon
                    name="check"
                    size={16}
                    className="mt-0.5 shrink-0 text-[color:var(--v2-ok)]"
                  />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`${v2Type.body} mt-2`}>No milestones are recorded yet.</p>
          )}
        </section>

        <section className="mt-7 border-t border-[var(--v2-line)] pt-5">
          <h2 className={v2Type.sectionTitle}>Evidence and details</h2>
          <div className="mt-3 space-y-2">
            <Link
              to="/v2/my-work"
              search={linkSearch}
              className="flex items-center justify-between rounded-[var(--v2-radius)] border border-[var(--v2-line)] px-3.5 py-3 no-underline hover:bg-[var(--v2-inset)]"
            >
              <span className={v2Type.bodyStrong}>View completed work</span>
              <V2Icon name="chev" size={15} className="text-[color:var(--v2-ink3)]" />
            </Link>
            <Link
              to="/v2/visibility/results"
              search={linkSearch}
              className="flex items-center justify-between rounded-[var(--v2-radius)] border border-[var(--v2-line)] px-3.5 py-3 no-underline hover:bg-[var(--v2-inset)]"
            >
              <span className={v2Type.bodyStrong}>View results</span>
              <V2Icon name="chev" size={15} className="text-[color:var(--v2-ink3)]" />
            </Link>
          </div>
        </section>
      </main>

      <aside
        aria-label="What's next"
        className="w-full shrink-0 space-y-5 border-t border-[var(--v2-line)] px-7 py-6 lg:w-[322px] lg:border-t-0 lg:border-l lg:px-6"
      >
        <section>
          <h3 className={v2Type.bodyStrong}>Your visibility</h3>
          <p className={`${v2Type.body} mt-2`}>
            Level completion does not provide a visibility reward, and visibility falling will not
            cost work points already earned.
          </p>
        </section>
        {nextTask ? (
          <section className="border-t border-[var(--v2-line)] pt-5">
            <h3 className={v2Type.bodyStrong}>Your next recommended task</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className={v2Type.body}>{nextTask.title}</p>
              <Chip tone="brand">{nextTask.points} work points</Chip>
            </div>
          </section>
        ) : null}
        <div className="border-t border-[var(--v2-line)] pt-5">
          <Button asChild className="h-10 w-full rounded-lg text-[13.5px]">
            <Link to="/v2/learn" search={linkSearch}>
              Continue to Level {nextLevel?.level ?? completion.level + 1}
            </Link>
          </Button>
          <Button asChild variant="ghost" className="mt-2 h-10 w-full rounded-lg text-[13.5px]">
            <Link to="/v2/my-work" search={linkSearch}>
              Review completed work
            </Link>
          </Button>
        </div>
      </aside>
    </div>
  );
}
