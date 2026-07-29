import { StatusDot, type StatusDotTone } from "@/components/foundations";

export interface ActionPlanTask {
  id: string;
  taskTitle: string;
  taskDescription?: string | null;
  priority: string;
  taskType: string;
  inputData?: any;
}

interface Props {
  index: number;
  task: ActionPlanTask;
}

// Priority renders as a dot + plain coloured text, never a filled chip
// (roadmap §1b/§1d: status is a coloured dot + text, not a background pill).
const priorityTone = (p: string): { dot: StatusDotTone; text: string } => {
  switch (p) {
    case "urgent":
      return { dot: "fail", text: "text-destructive" };
    case "high":
      return { dot: "fail", text: "text-destructive" };
    case "medium":
      return { dot: "warn", text: "text-warning" };
    default:
      return { dot: "neutral", text: "text-muted-foreground" };
  }
};

export default function ActionPlanItem({ index, task }: Props) {
  const tone = priorityTone(task.priority);
  return (
    <div
      className="rounded-md border border-border bg-card px-3.5 py-3 flex items-start gap-3"
      data-testid={`action-plan-item-${index}`}
    >
      <div className="shrink-0 w-6 h-6 rounded-md bg-primary/10 text-primary grid place-items-center font-semibold text-caption">
        {index}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-caption text-foreground">{task.taskTitle}</span>
          <span className={`inline-flex items-center gap-1.5 text-data font-medium ${tone.text}`}>
            <StatusDot tone={tone.dot} />
            {task.priority}
          </span>
        </div>
        {task.taskDescription && (
          <p className="mt-1 text-caption text-muted-foreground line-clamp-2">
            {task.taskDescription}
          </p>
        )}
      </div>
    </div>
  );
}
