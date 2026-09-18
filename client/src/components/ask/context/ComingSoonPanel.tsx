// Shared placeholder for a tab shell that exists but isn't built yet -
// Handoffs (Business context) and Approvals/Connections (the "What I know"
// drawer). Trakkr itself ships tabs like this (Your preferences reads "not
// available for this account" while still rendering its own heading and
// disclosure - 01-trakkr-teardown.md §2.8) - showing the shell rather than
// hiding the tab keeps the surface's shape legible instead of looking
// unfinished, without inventing any behaviour behind it.
import type { LucideIcon } from "lucide-react";

export function ComingSoonPanel({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-vc-default py-16 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-vc-muted text-vc-tertiary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mb-1 text-caption font-medium text-vc-primary">{title}</p>
      <p className="max-w-sm text-caption text-vc-tertiary">{description}</p>
    </div>
  );
}
