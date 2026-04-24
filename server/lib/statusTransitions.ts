// Guarded state transitions for tables that carry a `status` or
// `remediation_status` column. Callers must go through assertTransition()
// before UPDATE-ing the status — this prevents illegal transitions
// (e.g. flipping in_progress back to queued, re-resolving a resolved row).

export class InvalidStateTransitionError extends Error {
  status = 409 as const;
  constructor(
    public readonly table: string,
    public readonly from: string | null | undefined,
    public readonly to: string,
  ) {
    super(`Invalid ${table} transition: ${from ?? "null"} → ${to}`);
    this.name = "InvalidStateTransitionError";
  }
}

type TransitionMap = Record<string, readonly string[]>;

// Each table's allowed outgoing transitions. Missing key = terminal state.
// `null` key covers rows whose status was never set (legacy / fresh inserts).
const AGENT_TASK_TRANSITIONS: TransitionMap = {
  queued: ["in_progress", "cancelled"],
  scheduled: ["queued", "in_progress", "cancelled"],
  in_progress: ["completed", "failed", "cancelled"],
  // completed / failed / cancelled are terminal.
};

const HALLUCINATION_REMEDIATION_TRANSITIONS: TransitionMap = {
  // Direct pending → resolved is allowed: the UI's "Mark as resolved"
  // button is a one-click flow (the user fixed the page, the hallucination
  // is no longer reproducible — no need to first toggle "in_progress").
  pending: ["in_progress", "resolved", "dismissed"],
  in_progress: ["resolved", "dismissed"],
  resolved: ["verified", "in_progress"], // re-open if the hallucination reappears
  dismissed: [],
  verified: [],
};

const OUTREACH_EMAIL_TRANSITIONS: TransitionMap = {
  draft: ["scheduled", "sent", "cancelled"],
  scheduled: ["sent", "cancelled"],
  sent: ["bounced", "replied"],
  bounced: [],
  replied: [],
  cancelled: [],
};

const MAPS: Record<string, TransitionMap> = {
  agent_task: AGENT_TASK_TRANSITIONS,
  hallucination_remediation: HALLUCINATION_REMEDIATION_TRANSITIONS,
  outreach_email: OUTREACH_EMAIL_TRANSITIONS,
};

export type StateMachineName = keyof typeof MAPS;

export function assertTransition(
  machine: StateMachineName,
  from: string | null | undefined,
  to: string,
): void {
  const map = MAPS[machine];
  if (!map) throw new Error(`Unknown state machine: ${machine}`);
  // Same-state writes are a no-op and may represent retries; let them pass.
  if (from === to) return;
  const fromKey = from ?? "";
  const allowed = map[fromKey] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidStateTransitionError(machine, from, to);
  }
}
