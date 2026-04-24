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
import { useToast } from "@/hooks/use-toast";
import { Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Brand } from "@shared/schema";

type ScheduleTabProps = {
  selectedBrandId: string;
  selectedBrand: Brand | undefined;
};

export default function ScheduleTab({ selectedBrandId, selectedBrand }: ScheduleTabProps) {
  const { toast } = useToast();

  const scheduleMutation = useMutation({
    mutationFn: async ({ schedule, day }: { schedule: string; day: number }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/brands/${selectedBrandId}/citation-schedule`,
        { schedule, day },
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
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-red-500" />
          Auto-Citation Schedule
        </CardTitle>
        <CardDescription>Automatically re-check your tracked prompts.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium text-foreground mb-1.5 block">Frequency</label>
            <Select
              value={currentSchedule}
              onValueChange={(val) => scheduleMutation.mutate({ schedule: val, day: currentDay })}
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
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Day of week
              </label>
              <Select
                value={String(currentDay)}
                onValueChange={(val) =>
                  scheduleMutation.mutate({ schedule: currentSchedule, day: Number(val) })
                }
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
          )}
        </div>
        {currentSchedule !== "off" && (
          <p className="text-xs text-muted-foreground mt-3">
            Runs every{" "}
            {currentSchedule === "weekly"
              ? "week"
              : currentSchedule === "biweekly"
                ? "2 weeks"
                : "month"}{" "}
            on {DAY_NAMES[currentDay]}. Re-checks your tracked prompts across all 5 platforms.
            {selectedBrand?.lastAutoCitationAt && (
              <span className="ml-1">
                Last run:{" "}
                {formatDistanceToNow(new Date(selectedBrand.lastAutoCitationAt), {
                  addSuffix: true,
                })}
                .
              </span>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
