import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  CircleSlash,
  Clock,
  FileCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import type { EvidenceReference } from "@shared/work";
import { useVerifyTask, type WorkEvidenceView, type WorkTaskDetailView } from "../data/workTasks";
import { HUMAN_EVIDENCE_KIND, evidenceLabel } from "./evidence";

// THE CONFIRMATION GATE.
//
// This is the point of the screen. The software checks below have passed; the
// task is still not done, because a page check can tell you the text changed
// and cannot tell you the text is TRUE. So the primary control is genuinely
// disabled - `disabled` on the element, not a grey skin over a live button -
// until the person ticks the box, and the tick is what is sent to the server
// as `human_confirmation`.
//
// The gate is drawn only in the `submitted` state, because `verifyTask`
// (`server/domains/work/policy.ts:111`) accepts a confirmation from no other
// state. Drawing it earlier would offer a control the server would refuse.
//
// It also closes for a second, quieter reason: if the machine evidence the
// completion rule requires has not been recorded, `validateEvidenceForTask`
// will reject the call. Rather than let the click fail, the gate says which
// evidence is missing and stays shut.

type StatusSpec = { word: string; icon: LucideIcon; tone: string; glyph: string };

/**
 * What an evidence row's status means, said plainly.
 *
 * "Recorded" is not "Passed". A submitted piece of evidence has been written
 * down; it has not been checked. Collapsing the two would be the same lie the
 * confirmation gate exists to prevent, one level down.
 */
const STATUS_SPECS: Readonly<Record<WorkEvidenceView["status"], StatusSpec>> = {
  verified: { word: "Passed", icon: Check, tone: "text-positive", glyph: "check" },
  submitted: { word: "Recorded", icon: FileCheck, tone: "text-vc-secondary", glyph: "recorded" },
  rejected: { word: "Rejected", icon: XCircle, tone: "text-destructive", glyph: "rejected" },
  failed: { word: "Failed", icon: AlertTriangle, tone: "text-destructive", glyph: "failed" },
  unavailable: {
    word: "Unavailable",
    icon: CircleSlash,
    tone: "text-vc-tertiary",
    glyph: "unavailable",
  },
};

export function EvidenceStatus({ status }: { status: WorkEvidenceView["status"] }) {
  const spec = STATUS_SPECS[status];
  const Icon = spec.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-caption ${spec.tone}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" data-glyph={spec.glyph} />
      {spec.word}
    </span>
  );
}

/** The confirmation the person has not given yet. It is a state of its own -
 *  not a failure, and emphatically not a pass. */
export function PendingConfirmation() {
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-vc-secondary">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" data-glyph="pending" />
      Pending
    </span>
  );
}

function isEvidenceReference(value: unknown): value is EvidenceReference {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { kind?: unknown }).kind === "string"
  );
}

export function ConfirmationGate({ brandId, task }: { brandId: string; task: WorkTaskDetailView }) {
  const [confirmed, setConfirmed] = useState(false);
  const verify = useVerifyTask(brandId);
  // The app's own session read, under the app's own key. This tree does not
  // copy it under a `["v2", ...]` key: a second query for the same identity
  // could disagree with the first, and this tree only ever invalidates
  // `["v2","work"]`, so it can never push a refetch onto the shared entry.
  const { user } = useAuth();

  const required = task.completionRule?.required ?? [];
  const requiresConfirmation = required.includes(HUMAN_EVIDENCE_KIND);
  const submitted = (task.evidence ?? []).filter(
    (item) => item.role === "submission" || item.role === "verification",
  );
  const references = submitted
    .map((item) => item.structuredFinding)
    .filter(isEvidenceReference)
    .filter((reference) => reference.kind !== HUMAN_EVIDENCE_KIND);
  const recordedKinds = new Set<string>(references.map((reference) => reference.kind));
  const missing = required.filter(
    (kind) => kind !== HUMAN_EVIDENCE_KIND && !recordedKinds.has(kind),
  );

  const blocked = missing.length > 0 || !user?.id;
  const open = confirmed && !blocked && !verify.isPending;

  function confirm() {
    if (!user?.id) return;
    const note = `Confirmed by the brand owner: ${task.desiredResult}`;
    const evidence: EvidenceReference[] = [...references];
    if (requiresConfirmation) {
      evidence.push({
        kind: "confirmation",
        label: "Owner confirmation",
        confirmedByUserId: user.id,
        note,
        confirmedAt: new Date().toISOString(),
      });
    }
    verify.mutate({
      taskId: task.id,
      expectedRevision: task.revision,
      // Derived from the task version, never from the clock: the award key is
      // built from it, so the same confirmation sent twice awards once.
      cycleKey: `confirmation-v${task.taskVersion}`,
      note,
      confirmedByUserId: user.id,
      evidence,
    });
  }

  return (
    <div data-testid="v2-confirmation-gate">
      <section className="mt-6 rounded-md border border-vc-default">
        {submitted.length === 0 ? (
          <p className="px-4 py-3 text-body text-vc-tertiary" data-testid="v2-no-checks">
            No software check has been recorded for this task yet.
          </p>
        ) : (
          submitted.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 border-b border-vc-default px-4 py-3 last:border-b-0"
              data-testid="v2-application-check"
            >
              <span className="min-w-0 truncate text-body text-vc-primary">
                {evidenceLabel(item)}
              </span>
              <EvidenceStatus status={item.status} />
            </div>
          ))
        )}
        <div
          className="flex items-center justify-between gap-4 border-t border-vc-default px-4 py-3"
          data-testid="v2-human-check"
        >
          <span className="min-w-0 text-body text-vc-primary">
            You confirm that this change is factually correct
          </span>
          <PendingConfirmation />
        </div>
      </section>

      <section className="mt-6">
        <h3 className="text-data font-medium tracking-wide text-vc-tertiary uppercase">
          Your confirmation
        </h3>
        <label className="mt-3 flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={blocked}
            onChange={(event) => setConfirmed(event.target.checked)}
            data-testid="v2-confirm-checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-vc-default accent-(--brand-accent)"
          />
          <span>
            <span className="block text-body text-vc-primary">
              I confirm this is correct: {task.desiredResult}
            </span>
            <span className="mt-1 block text-caption text-vc-tertiary">
              Page checks cannot verify your business facts.
            </span>
          </span>
        </label>

        {missing.length > 0 && (
          <p className="mt-3 text-caption text-vc-secondary" data-testid="v2-gate-blocked">
            This task also needs {missing.join(", ").replace(/_/g, " ")} evidence, which has not
            been recorded yet. It cannot be completed here until it is.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4">
          {/* Really disabled, not merely styled that way. A machine check is
              not a human confirmation, and the control must not pretend it
              is. */}
          <Button size="sm" disabled={!open} data-testid="v2-confirm-complete" onClick={confirm}>
            {verify.isPending ? "Confirming…" : "Confirm and complete"}
          </Button>
          {/* The way out that loses nothing: the task stays submitted, and
              the confirmation is still waiting when the person comes back. */}
          <Link
            to="/v2/my-work"
            search={{}}
            className="text-caption font-medium text-vc-accent hover:underline"
          >
            Save for later
          </Link>
        </div>

        {verify.isError && (
          <p className="mt-3 text-caption text-destructive" data-testid="v2-verify-error">
            That confirmation was not saved: {verify.error.message}
          </p>
        )}

        <p className="mt-3 text-caption text-vc-tertiary">
          Points reward completed work. Visibility changes are measured separately.
        </p>
      </section>
    </div>
  );
}
