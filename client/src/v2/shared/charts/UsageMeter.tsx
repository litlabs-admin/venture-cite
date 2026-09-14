export type UsageMeterProps = {
  label: string;
  used: number;
  limit: number;
  unit: string;
};

function countText(used: number, limit: number, unit: string): string {
  if (unit.trim().length === 0) return `${used} of ${limit}`;
  return `${used} ${unit} of ${limit} ${unit}`;
}

export function UsageMeter({ label, used, limit, unit }: UsageMeterProps) {
  const count = countText(used, limit, unit);
  const percentage = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;

  return (
    <div
      role="img"
      aria-label={`${label}: ${count}`}
      className="flex w-full flex-col gap-1.5"
      data-chart="usage-meter"
    >
      <div
        className="flex items-center justify-between gap-3 text-sm"
        style={{ color: "var(--v2-ink3)" }}
      >
        <span>{label}</span>
        <span className="font-mono tabular-nums">{count}</span>
      </div>
      <div
        data-testid="usage-meter-bar"
        data-chart-element="usage-meter-bar"
        aria-hidden="true"
        style={{
          height: 7,
          width: "100%",
          overflow: "hidden",
          backgroundColor: "var(--v2-line)",
          borderRadius: 999,
        }}
      >
        <span
          style={{
            display: "block",
            height: "100%",
            width: `${percentage}%`,
            backgroundColor: "var(--v2-brand)",
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}
