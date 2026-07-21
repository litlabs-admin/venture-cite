import { ChecklistTickIcon } from "./icons";

// Card 02 visual — the 3-row action checklist (_reference/index.html:2488-2501).
// Checkboxes are unchecked in the settled/default state (empty square, tick
// undrawn) per source's actual resting classes/styles.
const items = [
  { label: "Add FAQ schema to /running", tag: "schema" },
  { label: "Fix robots.txt for GPTBot", tag: "crawl" },
  { label: "Pitch runnersworld.com", tag: "authority" },
];

export function ActionChecklist() {
  return (
    <div className="w-full space-y-3">
      {items.map((item) => (
        <div key={item.label} className="flex min-h-[28px] items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="w-[15px] h-[15px] rounded-[3px] border flex items-center justify-center flex-shrink-0 transition-colors duration-300 border-tk-default bg-tk-surface">
              <ChecklistTickIcon />
            </span>
            <span className="text-[12px] truncate transition-colors duration-300 text-tk-tertiary">
              {item.label}
            </span>
          </span>
          <span className="text-[10px] font-medium tabular-nums transition-colors duration-300 text-tk-text-muted">
            {item.tag}
          </span>
        </div>
      ))}
    </div>
  );
}
