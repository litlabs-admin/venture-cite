import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Calendar, CheckCircle2, XCircle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import type { Brand } from "@shared/schema";

type ScheduleTabProps = {
  selectedBrandId: string;
  selectedBrand:
    | (Brand & {
        autoCitationHour?: number;
        autoCitationActive?: boolean;
        lastAutoCitationStatus?: string | null;
      })
    | undefined;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Wave 9: each scheduled run uses ~1 AI call per (prompt × platform).
// Default brand setup is 10 prompts × 5 platforms = 50 calls/run. Surfaced
// as a warning below the controls so users know what they're authorizing.
const ESTIMATED_CALLS_PER_RUN = 50;

// Wave 9: predict the next-run timestamp client-side. Server schedule is
// in UTC; we render in the user's local TZ so they see when results
// actually arrive. Returns null when schedule is off/paused or never run.
function nextRunAt(opts: {
  schedule: string;
  active: boolean;
  dayOfWeek: number; // 0=Sun…6=Sat (UTC)
  hour: number; // 0-23 UTC
  lastAt: Date | null;
}): Date | null {
  if (opts.schedule === "off" || !opts.active) return null;
  // Build the candidate: next occurrence of (dayOfWeek, hour) ≥ "now".
  const now = new Date();
  const candidate = new Date(now);
  candidate.setUTCHours(opts.hour, 0, 0, 0);
  // Move to the requested day-of-week.
  const daysAhead = (opts.dayOfWeek - candidate.getUTCDay() + 7) % 7;
  candidate.setUTCDate(candidate.getUTCDate() + daysAhead);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
  }
  // Respect the cadence relative to the last run.
  const minDays =
    opts.schedule === "weekly"
      ? 7
      : opts.schedule === "biweekly"
        ? 14
        : opts.schedule === "monthly"
          ? 28
          : 7;
  if (opts.lastAt) {
    const earliestNext = new Date(opts.lastAt.getTime() + minDays * 24 * 60 * 60 * 1000);
    while (candidate.getTime() < earliestNext.getTime()) {
      candidate.setUTCDate(candidate.getUTCDate() + 7);
    }
  }
  return candidate;
}

export default function ScheduleTab({ selectedBrandId, selectedBrand }: ScheduleTabProps) {
  const { toast } = useToast();

  const scheduleMutation = useMutation({
    mutationFn: async (patch: {
      schedule?: string;
      day?: number;
      hour?: number;
      active?: boolean;
    }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/brands/${selectedBrandId}/citation-schedule`,
        patch,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({ title: "Schedule updated" });
    },
    onError: (err: Error) =>
      toast({
        title: "Failed to update schedule",
        description: err.message,
        variant: "destructive",
      }),
  });

  const currentSchedule = selectedBrand?.autoCitationSchedule || "off";
  const currentDay = selectedBrand?.autoCitationDay ?? 0;
  // Wave 9: defaults from migration 0037. Be tolerant of pre-migration rows.
  const currentHour = selectedBrand?.autoCitationHour ?? 9;
  const currentActive = selectedBrand?.autoCitationActive ?? true;
  const lastStatus = selectedBrand?.lastAutoCitationStatus;

  const next = nextRunAt({
    schedule: currentSchedule,
    active: currentActive,
    dayOfWeek: currentDay,
    hour: currentHour,
    lastAt: selectedBrand?.lastAutoCitationAt ? new Date(selectedBrand.lastAutoCitationAt) : null,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-red-500" />
          Auto-Citation Schedule
        </CardTitle>
        <CardDescription>Automatically re-check your tracked prompts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium text-foreground mb-1.5 block">Frequency</label>
            <Select
              value={currentSchedule}
              onValueChange={(val) => scheduleMutation.mutate({ schedule: val })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                <SelectItem value="weekly">Every week</SelectItem>
                <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                <SelectItem value="monthly">Every month</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {currentSchedule !== "off" && (
            <>
              <div className="flex-1">
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Day of week
                </label>
                <Select
                  value={String(currentDay)}
                  onValueChange={(val) => scheduleMutation.mutate({ day: Number(val) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Wave 9: hour-of-day picker. Stored as UTC; rendered with
                  the local-TZ next-run preview below so users can sanity
                  check it. */}
              <div className="flex-1">
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Hour (UTC)
                </label>
                <Select
                  value={String(currentHour)}
                  onValueChange={(val) => scheduleMutation.mutate({ hour: Number(val) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {Array.from({ length: 24 }, (_, h) => (
                      <SelectItem key={h} value={String(h)}>
                        {String(h).padStart(2, "0")}:00 UTC
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  ⓘ Scheduled jobs run once per day around 06:00 UTC. The hour-of-day selection is
                  preserved for future plan upgrades.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Wave 9: pause toggle. Setting frequency to "off" loses the day
            and hour selection; this preserves them so the user can resume
            with one click. */}
        {currentSchedule !== "off" && (
          <div className="flex items-center justify-between p-3 rounded border border-border bg-muted/20">
            <div>
              <div className="text-sm font-medium">{currentActive ? "Active" : "Paused"}</div>
              <div className="text-xs text-muted-foreground">
                {currentActive
                  ? "Scheduled runs are firing on the selected day and hour."
                  : "Schedule retained but runs are not firing. Toggle to resume."}
              </div>
            </div>
            <Switch
              checked={currentActive}
              onCheckedChange={(v) => scheduleMutation.mutate({ active: v })}
              data-testid="switch-citation-active"
            />
          </div>
        )}

        {currentSchedule !== "off" && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              Runs every{" "}
              {currentSchedule === "weekly"
                ? "week"
                : currentSchedule === "biweekly"
                  ? "2 weeks"
                  : "month"}{" "}
              on {DAY_NAMES[currentDay]} at {String(currentHour).padStart(2, "0")}:00 UTC. Each run
              uses ~{ESTIMATED_CALLS_PER_RUN} AI calls from your monthly quota.
            </p>
            {/* Wave 9: next-run-at preview in local TZ. Hidden when
                paused since there's no next run. */}
            {next && (
              <p>
                <span className="font-medium text-foreground">Next run:</span>{" "}
                {format(next, "EEE MMM d, h:mm a")} your time.
              </p>
            )}
            {selectedBrand?.lastAutoCitationAt && (
              <p className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">Last run:</span>
                {formatDistanceToNow(new Date(selectedBrand.lastAutoCitationAt), {
                  addSuffix: true,
                })}
                {/* Wave 9: surface success/failure of the most recent run
                    so users notice silent failures without going to History. */}
                {lastStatus === "succeeded" && (
                  <span className="inline-flex items-center text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    succeeded
                  </span>
                )}
                {lastStatus === "failed" && (
                  <span className="inline-flex items-center text-red-600 dark:text-red-400">
                    <XCircle className="h-3 w-3 mr-1" />
                    failed
                  </span>
                )}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
