const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// Footer stat bar (_reference/index.html:2725-2754). Source's four
// count-up stats (brands_tracked: 25333, prompts_analyzed: 72197337,
// citations_analyzed: 1339381, competitors_mapped: 3227398, recoverable
// from _reference/assets/platform-stats-B-nGzrPY.js) were the OTHER
// company's real telemetry. VentureCite is pre-launch and has no
// comparable numbers, so this renders non-numeric capability labels
// instead — useCountUp is no longer imported/used here (rebrand pass).
const stats = [
  { label: "Every major engine", delayMs: 0 },
  { label: "Citations & sources", delayMs: 50 },
  { label: "Competitor benchmarks", delayMs: 100 },
  { label: "Weekly reports", delayMs: 150 },
];

function StatTile({
  label,
  delayMs,
  isVisible,
}: {
  label: string;
  delayMs: number;
  isVisible: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-2 sm:px-6 lg:px-8 py-2.5 sm:py-3 transition-all duration-500 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      style={{ transitionDelay: `${delayMs}ms`, transitionTimingFunction: EASE }}
    >
      <span className="text-[13px] sm:text-[15px] lg:text-[16px] font-semibold tracking-tight text-tk-primary tabular-nums">
        {label}
      </span>
    </div>
  );
}

export function StatBar({ isVisible }: { isVisible: boolean }) {
  return (
    <div className="border-t border-tk-default">
      <div
        className={`grid grid-cols-2 lg:grid-cols-4 transition-all duration-700 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionTimingFunction: EASE }}
      >
        {stats.map((stat) => (
          <StatTile key={stat.label} {...stat} isVisible={isVisible} />
        ))}
      </div>
    </div>
  );
}
