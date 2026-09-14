import type { ReactNode } from "react";

export type V2TopBarProps = {
  left?: ReactNode;
  right?: ReactNode;
};

export function V2TopBar({ left, right }: V2TopBarProps) {
  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--v2-line)] bg-[var(--v2-paper)] px-7 text-[13px] text-[color:var(--v2-ink2)]">
      <div className="min-w-0 truncate">{left}</div>
      <div className="flex shrink-0 items-center gap-4">{right}</div>
    </header>
  );
}
