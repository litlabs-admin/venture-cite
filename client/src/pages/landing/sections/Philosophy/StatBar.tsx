const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// Footer stat bar (_reference/index.html:2725-2754). The reference renders
// four count-up numbers (brands_tracked: 25333, prompts_analyzed: 72197337,
// citations_analyzed: 1339381, competitors_mapped: 3227398, recoverable from
// _reference/assets/platform-stats-B-nGzrPY.js) on a blue gradient bar.
//
// We port the CHROME (gradient bar, inset top hairline, white type, two-line
// tile layout) but NOT the numbers: those are another company's real
// telemetry and presenting them as ours would be a lie. VentureCite is
// pre-launch and has no comparable figures, so each tile shows a capability
// label only. With no number to animate, useCountUp is deliberately not
// imported here — reinstate it if/when real metrics exist.
const stats = [
  { label: "Every major engine", delayMs: 0 },
  { label: "Why they get picked", delayMs: 50 },
  { label: "Who is named instead", delayMs: 100 },
  { label: "A weekly plan to fix it", delayMs: 150 },
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
      {/* The reference's tile is two lines (count-up number over a caption).
          With the fabricated numbers removed there is only the label, so it
          takes the prominent white slot rather than leaving an empty line. */}
      <span className="text-[13px] sm:text-[15px] lg:text-[16px] font-semibold tracking-tight text-white text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

export function StatBar({ isVisible }: { isVisible: boolean }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, #3355ff 0%, rgb(133, 153, 255) 100%)",
        boxShadow: "inset 0 1px 0 var(--hb-hairline-strong)",
      }}
    >
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
