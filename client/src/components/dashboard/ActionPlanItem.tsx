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

const priorityTone = (p: string) => {
  switch (p) {
    case "urgent":
      return "bg-destructive/15 text-destructive";
    case "high":
      return "bg-destructive/10 text-destructive";
    case "medium":
      return "bg-amber-500/15 text-amber-400";
    default:
      return "bg-muted text-muted-foreground";
  }
};

export default function ActionPlanItem({ index, task }: Props) {
  return (
    <div
      className="rounded-md border border-border bg-card px-3.5 py-3 flex items-start gap-3"
      data-testid={`action-plan-item-${index}`}
    >
      <div className="shrink-0 w-6 h-6 rounded-md bg-primary/10 text-primary grid place-items-center font-semibold text-xs">
        {index}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-foreground">{task.taskTitle}</span>
          <span className={`text-[11px] px-1.5 py-0.5 rounded ${priorityTone(task.priority)}`}>
            {task.priority}
          </span>
        </div>
        {task.taskDescription && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.taskDescription}</p>
        )}
      </div>
    </div>
  );
}
