import type { ReactNode } from "react";
import { V2Icon } from "@/v2/theme/V2Icon";
import type { V2IconName } from "@/v2/contracts/icons";
import { Chip } from "@/v2/shared/ui/Chip";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { v2Type } from "@/v2/theme/typography";

export type WorkValue<T> =
  { kind: "measured"; value: T } | { kind: "not-measured"; reason: string };

export type WorkStatus =
  "todo" | "ready" | "in-progress" | "waiting" | "completed" | "not-measured";

const statusLabels: Readonly<Record<Exclude<WorkStatus, "not-measured">, string>> = {
  todo: "To do",
  ready: "Ready",
  "in-progress": "In progress",
  waiting: "Waiting",
  completed: "Completed",
};

export function WorkTaskIdentity({
  icon,
  title,
  compact = false,
  meta,
  selected = false,
}: {
  icon: V2IconName;
  title: string;
  compact?: boolean;
  meta?: ReactNode;
  selected?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-[7px] ${selected ? "bg-[var(--v2-brand-soft)] text-[color:var(--v2-brand)]" : "bg-[var(--v2-inset)] text-[color:var(--v2-ink3)]"} ${compact ? "h-6 w-6" : "h-8 w-8"}`}
      >
        <V2Icon name={icon} size={compact ? 13 : 15} />
      </span>
      <span className="min-w-0">
        <span className={compact ? v2Type.body : v2Type.bodyStrong}>{title}</span>
        {meta ? <span className="block">{meta}</span> : null}
      </span>
    </span>
  );
}

export function WorkStatusLabel({ status, className }: { status: WorkStatus; className?: string }) {
  if (status === "not-measured") {
    return <StateLabel state="not-measured" className={className} />;
  }

  return (
    <Chip
      tone={status === "ready" || status === "todo" ? "brand" : "neutral"}
      className={className}
    >
      {statusLabels[status]}
    </Chip>
  );
}

export function WorkOwner({ owner, className }: { owner: WorkValue<string>; className?: string }) {
  if (owner.kind === "not-measured") {
    return <StateLabel state="not-measured" className={className} />;
  }
  return <span className={`${v2Type.body} ${className ?? ""}`}>{owner.value}</span>;
}

export function WorkValueText<T>({
  value,
  format = String,
  className,
}: {
  value: WorkValue<T>;
  format?: (value: T) => ReactNode;
  className?: string;
}) {
  if (value.kind === "not-measured") {
    return <StateLabel state="not-measured" className={className} />;
  }
  return <span className={className}>{format(value.value)}</span>;
}
