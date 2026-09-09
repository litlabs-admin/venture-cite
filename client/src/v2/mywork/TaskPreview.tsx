import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkTask } from "../data/workTasks";
import type { WorkEvidenceView } from "../data/workTasks";
import { completionRuleSentences, evidenceLabel, formatDate } from "./evidence";
import { TaskActions } from "./TaskActions";

// The rail on the list screen: the selected task, before opening it.
//
// It answers three questions in the artboard's order - why this task, what the
// evidence is, and what will count as done - and then offers the way in. It
// never states an outcome: nothing here says the work will improve visibility,
// because nothing measured has said so yet.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-vc-muted ${className}`} aria-hidden="true" />;
}

function EvidenceRow({ item }: { item: WorkEvidenceView }) {
  const date = formatDate(item.retrievedAt ?? item.observedAt ?? item.createdAt);
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 py-1">
      <span className="text-data font-medium tracking-wide text-vc-tertiary uppercase">
        {evidenceLabel(item)}
      </span>
      <span className="min-w-0 text-body text-vc-primary">
        {item.excerpt ?? <span className="text-vc-tertiary">Recorded without an excerpt</span>}
        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 block truncate text-caption text-vc-accent hover:underline"
          >
            {item.sourceUrl}
          </a>
        )}
        {date && <span className="mt-0.5 block text-caption text-vc-tertiary">Checked {date}</span>}
      </span>
    </div>
  );
}

export function TaskPreview({ brandId, taskId }: { brandId: string; taskId: string | undefined }) {
  const query = useWorkTask(brandId, taskId);

  if (!taskId) {
    return (
      <p className="text-body text-vc-secondary" data-testid="v2-preview-none">
        Choose a task to see why it is here and what will count as done.
      </p>
    );
  }

  if (query.isPending) {
    return (
      <div data-testid="v2-preview-loading" role="status" aria-busy="true">
        <span className="sr-only">Loading the task</span>
        <Bar className="h-5 w-48" />
        <Bar className="mt-4 h-4 w-32" />
        <Bar className="mt-2 h-4 w-full" />
        <Bar className="mt-6 h-4 w-24" />
        <Bar className="mt-2 h-4 w-full" />
        <Bar className="mt-8 h-9 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div data-testid="v2-preview-error">
        <p className="text-body text-vc-secondary">
          This task could not be loaded. The list beside it is unaffected.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  const task = query.data;
  const evidence = (task.evidence ?? []).filter((item) => item.role === "trigger");
  const rules = completionRuleSentences(task.completionRule?.required);

  return (
    <div data-testid="v2-task-preview">
      <h2 className="text-section font-semibold text-vc-primary">{task.title}</h2>

      <section className="mt-4">
        <h3 className="text-body font-semibold text-vc-primary">Why this task?</h3>
        <p className="mt-1 text-body text-vc-secondary">{task.reason ?? task.desiredResult}</p>
      </section>

      <section className="mt-5">
        <h3 className="text-body font-semibold text-vc-primary">Evidence</h3>
        {evidence.length === 0 ? (
          // Not an empty frame and not a zero: the task exists, the evidence
          // rows behind it have not been written.
          <p className="mt-1 text-body text-vc-tertiary" data-testid="v2-preview-no-evidence">
            No evidence has been recorded for this task yet.
          </p>
        ) : (
          <div className="mt-2">
            {evidence.map((item) => (
              <EvidenceRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-5">
        <h3 className="text-body font-semibold text-vc-primary">Completion rule</h3>
        {rules.map((line) => (
          <p key={line} className="mt-1 text-body text-vc-secondary">
            {line}
          </p>
        ))}
      </section>

      <div className="mt-5">
        <TaskActions
          brandId={brandId}
          task={task}
          primary={
            /* The shipped `default` variant rests as a tint and fills on
               hover. Used unmodified - no bg-* through className. */
            <Button asChild size="sm" className="w-full">
              <Link to="/v2/my-work" search={{ task: task.id }}>
                Open task
              </Link>
            </Button>
          }
        />
      </div>

      <div className="mt-6 border-t border-vc-default pt-4">
        <p className="flex items-start gap-2 text-caption text-vc-accent">
          <Star className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{task.points} points after verification · Awarded once</span>
        </p>
        <p className="mt-2 text-caption text-vc-tertiary">
          No points for clicks, drafts, or generated content.
        </p>
      </div>
    </div>
  );
}
