// Renders one typed rich block. Never dangerouslySetInnerHTML (AGENTS.md) -
// every kind is a real React component. One number formatter used
// everywhere (fixes Trakkr's I5: `10` rendered beside `61.8` -
// 01-trakkr-teardown.md §2.4).
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { AskBlock as AskBlockType } from "@shared/ask/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Two shades of the SAME brand-blue hue, not blue-vs-grey and not a
// per-bar gradient. These are competitor/prompt NAMES: reordering them
// (by citation count, alphabetically, whatever) doesn't change what any
// one of them means, which makes this a nominal-categorical chart, not an
// ordinal or magnitude one - dataviz skill's color-formula.md: "Never
// color nominal bars by their value: that spends the identity channel
// re-encoding what bar length already shows." So every bar keeps the same
// hue; `highlight` (this brand's own row, among competitors) is the one
// real identity distinction here - self vs. everyone else - not a value
// ranking, so it earns its own shade legitimately.
//
// MUTED reuses the exact `rgb(var(--brand-accent-rgb) / alpha)` mechanism
// GapsRow.tsx already validated for the same brand hue at partial opacity.
// alpha 0.7 is not eyeballed: contrast(blend(brand, 0.7, surface), surface)
// clears the dataviz skill's >=3:1 mark floor in BOTH modes - 3.05:1 light
// (on --bg-surface-2 #ffffff), 3.07:1 dark (on --bg-surface-2 #1b1b1e) -
// computed with the skill's own validate_palette.js contrast() function,
// not assumed. The plain grey this replaced (--vc-tertiary, #9CA3AF) was
// itself only 2.54:1 against white - already below that floor.
const ACCENT = "var(--brand-accent)";
const MUTED = "rgb(var(--brand-accent-rgb) / 0.7)";

function formatScore(n: number): string {
  // One formatter for every score, everywhere in Ask - fixes I5.
  return Number.isInteger(n) ? n.toFixed(1) : n.toFixed(1);
}

function BarChartBlock({ block }: { block: Extract<AskBlockType, { kind: "bar_chart" }> }) {
  const data = block.rows.map((r) => ({ ...r, display: formatScore(r.value) }));
  return (
    <div className="mb-3 rounded-md border border-vc-default bg-vc-surface p-4">
      {block.title && (
        <p className="mb-3 text-caption font-medium text-vc-primary">{block.title}</p>
      )}
      <div style={{ height: Math.max(160, data.length * 32) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 32 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="var(--vc-default, #e5e7eb)"
            />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={120}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Bar dataKey="value" radius={[0, 3, 3, 0]}>
              {data.map((row, i) => (
                <Cell key={i} fill={row.highlight ? ACCENT : MUTED} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex justify-between text-caption text-vc-tertiary">
        <span />
        <span>{block.unit}</span>
      </div>
    </div>
  );
}

function TableBlock({ block }: { block: Extract<AskBlockType, { kind: "table" }> }) {
  return (
    <div className="mb-3 overflow-hidden rounded-md border border-vc-default bg-vc-surface">
      <p className="border-b border-vc-default px-4 py-2 text-caption font-medium text-vc-primary">
        {block.title}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            {block.columns.map((c) => (
              <TableHead key={c.key} className={c.align === "right" ? "text-right" : undefined}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {block.rows.map((row, i) => (
            <TableRow key={i}>
              {block.columns.map((c) => (
                <TableCell
                  key={c.key}
                  className={c.align === "right" ? "text-right tabular-nums" : undefined}
                >
                  {row[c.key] ?? "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatRowBlock({ block }: { block: Extract<AskBlockType, { kind: "stat_row" }> }) {
  return (
    <div className="mb-3 flex flex-wrap gap-4 rounded-md border border-vc-default bg-vc-surface p-4">
      {block.items.map((item, i) => (
        <div key={i}>
          <p className="text-caption text-vc-tertiary">{item.label}</p>
          <p className="font-mono text-body font-semibold tabular-nums text-vc-primary">
            {item.value}
            {typeof item.delta === "number" && (
              <span className={item.delta >= 0 ? "ml-1 text-positive" : "ml-1 text-destructive"}>
                {item.delta >= 0 ? "+" : ""}
                {item.delta}
              </span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

export function AskBlockView({ block }: { block: AskBlockType }) {
  switch (block.kind) {
    case "bar_chart":
      return <BarChartBlock block={block} />;
    case "table":
      return <TableBlock block={block} />;
    case "stat_row":
      return <StatRowBlock block={block} />;
    default:
      // Unknown kind from a newer server than this client knows about -
      // dropped silently rather than crashing the message (04 §3.5).
      return null;
  }
}
