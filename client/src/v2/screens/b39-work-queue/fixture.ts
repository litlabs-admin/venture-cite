import type { Board39Data, Board39Task } from "./Screen";
import type { WorkValue } from "../b03-task-list/shared/WorkRowParts";

const measured = <T>(value: T): WorkValue<T> => ({ kind: "measured", value });

function readyTask(input: {
  id: string;
  title: string;
  evidenceProblem: string;
  expectedResult: string;
  estimatedMinutes: number;
  points: number;
  dueDate: string;
  verificationMethod: string;
  icon: Board39Task["icon"];
}): Board39Task {
  return {
    id: input.id,
    title: input.title,
    icon: input.icon,
    evidenceProblem: measured(input.evidenceProblem),
    expectedResult: measured(input.expectedResult),
    estimatedMinutes: measured(input.estimatedMinutes),
    points: measured(input.points),
    ownerName: measured("You"),
    dueDate: measured(input.dueDate),
    status: "ready",
    verificationMethod: measured(input.verificationMethod),
  };
}

export const board39Fixture = {
  brandId: "brand-venture-pr",
  mode: "guided",
  brandName: "VenturePR",
  workGoal: measured("Move VenturePR forward with high-impact PR work"),
  taskCounts: {
    ready: measured(5),
    inProgress: measured(0),
    waiting: measured(0),
    completed: measured(0),
  },
  priority: {
    id: measured("task-priority"),
    title: measured("Correct the service description"),
    points: measured(40),
  },
  tasks: [
    readyTask({
      id: "task-1",
      title: "Confirm service region",
      evidenceProblem: "Service region is unclear to buyers.",
      expectedResult: "Clear and accurate service region in VenturePR.",
      estimatedMinutes: 15,
      points: 20,
      dueDate: "Sep 9",
      verificationMethod: "Service page updated",
      icon: "doc",
    }),
    readyTask({
      id: "task-2",
      title: "Improve startup buyer guide",
      evidenceProblem: "Guide is missing key information buyers need.",
      expectedResult: "Clear, helpful guide for startup buyers.",
      estimatedMinutes: 30,
      points: 30,
      dueDate: "Sep 10",
      verificationMethod: "Guide page published",
      icon: "map",
    }),
    readyTask({
      id: "task-3",
      title: "Add pricing evidence",
      evidenceProblem: "Insufficient evidence for pricing.",
      expectedResult: "Verified pricing details with proof points.",
      estimatedMinutes: 20,
      points: 25,
      dueDate: "Sep 11",
      verificationMethod: "Pricing page updated",
      icon: "doc",
    }),
    readyTask({
      id: "task-4",
      title: "Review PR visibility results",
      evidenceProblem: "Recent results not reviewed.",
      expectedResult: "Understanding of PR visibility progress and trends.",
      estimatedMinutes: 25,
      points: 20,
      dueDate: "Sep 12",
      verificationMethod: "Results noted in VenturePR",
      icon: "chart",
    }),
    readyTask({
      id: "task-5",
      title: "Connect qualified inquiry data",
      evidenceProblem: "Inquiry data not connected or reviewed.",
      expectedResult: "Verified connection and initial insights on qualified inquiries.",
      estimatedMinutes: 20,
      points: 25,
      dueDate: "Sep 12",
      verificationMethod: "Data connected and verified",
      icon: "globe",
    }),
  ],
  weeklyCapacity: {
    range: measured("Sep 8 – Sep 14, 2026"),
    plannedMinutes: measured(480),
    usedMinutes: measured(360),
  },
  progress: {
    level: measured(2),
    levelName: measured("Ready"),
    earnedWorkPoints: measured(120),
    levelTargetPoints: measured(160),
  },
  blockerCount: measured(0),
  waitingVerificationCount: measured(0),
} satisfies Board39Data;
