import type { ReactNode } from "react";
import type { BoardId, V2ScreenProps } from "@/v2/contracts/screen";
import type { V2ShellVariant } from "@/v2/contracts/shell";
import { Board01Screen } from "./b01-today/Screen";
import { board01Fixture } from "./b01-today/fixture";
import { Board01Route } from "./b01-today/Route";
import { Board02Screen } from "./b02-today-earlier/Screen";
import { board02Fixture } from "./b02-today-earlier/fixture";
import { Board02Route } from "./b02-today-earlier/Route";
import { Board03Screen } from "./b03-task-list/Screen";
import { board03Fixture } from "./b03-task-list/fixture";
import { Board03Route } from "./b03-task-list/Route";
import { Board04Screen } from "./b04-factual-correction/Screen";
import { board04Fixture } from "./b04-factual-correction/fixture";
import { Board04Route } from "./b04-factual-correction/Route";
import { Board05Screen } from "./b05-confirmation-gate/Screen";
import { board05Fixture } from "./b05-confirmation-gate/fixture";
import { Board05Route } from "./b05-confirmation-gate/Route";
import { Board06Screen } from "./b06-buyer-guide-editor/Screen";
import { board06Fixture } from "./b06-buyer-guide-editor/fixture";
import { Board06Route } from "./b06-buyer-guide-editor/Route";
import { Board07Screen } from "./b07-brand-facts/Screen";
import { board07Fixture } from "./b07-brand-facts/fixture";
import { Board07Route } from "./b07-brand-facts/Route";
import { Board08Screen } from "./b08-visibility-overview/Screen";
import { board08Fixture } from "./b08-visibility-overview/fixture";
import { Board08Route } from "./b08-visibility-overview/Route";
import { Board09Screen } from "./b09-visibility-evidence/Screen";
import { board09Fixture } from "./b09-visibility-evidence/fixture";
import { Board09Route } from "./b09-visibility-evidence/Route";
import { Board10Screen } from "./b10-results-review/Screen";
import { board10Fixture } from "./b10-results-review/fixture";
import { Board10Route } from "./b10-results-review/Route";
import { Board11Screen } from "./b11-prompt-diagnosis/Screen";
import { board11Fixture } from "./b11-prompt-diagnosis/fixture";
import { Board11Route } from "./b11-prompt-diagnosis/Route";
import { Board12Screen } from "./b12-geo-signals/Screen";
import { board12Fixture } from "./b12-geo-signals/fixture";
import { Board12Route } from "./b12-geo-signals/Route";
import { Board13Screen } from "./b13-perception/Screen";
import { board13Fixture } from "./b13-perception/fixture";
import { Board13Route } from "./b13-perception/Route";
import { Board14Screen } from "./b14-learn/Screen";
import { board14Fixture } from "./b14-learn/fixture";
import { Board14Route } from "./b14-learn/Route";
import { Board15Screen } from "./b15-revision-review/Screen";
import { board15Fixture } from "./b15-revision-review/fixture";
import { Board15Route } from "./b15-revision-review/Route";
import { Board16Screen } from "./b16-publication-check/Screen";
import { board16Fixture } from "./b16-publication-check/fixture";
import { Board16Route } from "./b16-publication-check/Route";
import { Board17Screen } from "./b17-experiment/Screen";
import { board17Fixture } from "./b17-experiment/fixture";
import { Board17Route } from "./b17-experiment/Route";
import { Board18Screen } from "./b18-site-health/Screen";
import { board18Fixture } from "./b18-site-health/fixture";
import { Board18Route } from "./b18-site-health/Route";
import { Board19Screen } from "./b19-content-task/Screen";
import { board19Fixture } from "./b19-content-task/fixture";
import { Board19Route } from "./b19-content-task/Route";
import { Board20Screen } from "./b20-report/Screen";
import { board20Fixture } from "./b20-report/fixture";
import { Board20Route } from "./b20-report/Route";
import { Board21Screen } from "./b21-outcome-review/Screen";
import { board21Fixture } from "./b21-outcome-review/fixture";
import { Board21Route } from "./b21-outcome-review/Route";
import { Board22Screen } from "./b22-geo-assistant/Screen";
import { board22Fixture } from "./b22-geo-assistant/fixture";
import { Board22Route } from "./b22-geo-assistant/Route";
import { Board23Screen } from "./b23-agency-dashboard/Screen";
import { board23Fixture } from "./b23-agency-dashboard/fixture";
import { Board23Route } from "./b23-agency-dashboard/Route";
import { Board24Screen } from "./b24-settings/Screen";
import { board24Fixture } from "./b24-settings/fixture";
import { Board24Route } from "./b24-settings/Route";
import { Board25Screen } from "./b25-integrations/Screen";
import { board25Fixture } from "./b25-integrations/fixture";
import { Board25Route } from "./b25-integrations/Route";
import { Board26Screen } from "./b26-sign-in/Screen";
import { board26Fixture } from "./b26-sign-in/fixture";
import { Board26Route } from "./b26-sign-in/Route";
import { Board27Screen } from "./b27-plan-selection/Screen";
import { board27Fixture } from "./b27-plan-selection/fixture";
import { Board27Route } from "./b27-plan-selection/Route";
import { Board28Screen } from "./b28-onboarding-start/Screen";
import { board28Fixture } from "./b28-onboarding-start/fixture";
import { Board28Route } from "./b28-onboarding-start/Route";
import { Board29Screen } from "./b29-website-inspection/Screen";
import { board29Fixture } from "./b29-website-inspection/fixture";
import { Board29Route } from "./b29-website-inspection/Route";
import { Board30Screen } from "./b30-onboarding-facts/Screen";
import { board30Fixture } from "./b30-onboarding-facts/fixture";
import { Board30Route } from "./b30-onboarding-facts/Route";
import { Board31Screen } from "./b31-onboarding-questions/Screen";
import { board31Fixture } from "./b31-onboarding-questions/fixture";
import { Board31Route } from "./b31-onboarding-questions/Route";
import { Board32Screen } from "./b32-baseline-creation/Screen";
import { board32Fixture } from "./b32-baseline-creation/fixture";
import { Board32Route } from "./b32-baseline-creation/Route";
import { Board33Screen } from "./b33-baseline-review/Screen";
import { board33Fixture } from "./b33-baseline-review/fixture";
import { Board33Route } from "./b33-baseline-review/Route";
import { Board34Screen } from "./b34-facts-workspace/Screen";
import { board34Fixture } from "./b34-facts-workspace/fixture";
import { Board34Route } from "./b34-facts-workspace/Route";
import { Board35Screen } from "./b35-question-portfolio/Screen";
import { board35Fixture } from "./b35-question-portfolio/fixture";
import { Board35Route } from "./b35-question-portfolio/Route";
import { Board36Screen } from "./b36-question-detail/Screen";
import { board36Fixture } from "./b36-question-detail/fixture";
import { Board36Route } from "./b36-question-detail/Route";
import { Board37Screen } from "./b37-citation-explorer/Screen";
import { board37Fixture } from "./b37-citation-explorer/fixture";
import { Board37Route } from "./b37-citation-explorer/Route";
import { Board38Screen } from "./b38-competitor-gap/Screen";
import { board38Fixture } from "./b38-competitor-gap/fixture";
import { Board38Route } from "./b38-competitor-gap/Route";
import { Board39Screen } from "./b39-work-queue/Screen";
import { board39Fixture } from "./b39-work-queue/fixture";
import { Board39Route } from "./b39-work-queue/Route";
import { Board40Screen } from "./b40-earned-media/Screen";
import { board40Fixture } from "./b40-earned-media/fixture";
import { Board40Route } from "./b40-earned-media/Route";
import { Board41Screen } from "./b41-content-opportunities/Screen";
import { board41Fixture } from "./b41-content-opportunities/fixture";
import { Board41Route } from "./b41-content-opportunities/Route";
import { Board42Screen } from "./b42-team-handoff/Screen";
import { board42Fixture } from "./b42-team-handoff/fixture";
import { Board42Route } from "./b42-team-handoff/Route";
import { Board43Screen } from "./b43-notifications/Screen";
import { board43Fixture } from "./b43-notifications/fixture";
import { Board43Route } from "./b43-notifications/Route";
import { Board44Screen } from "./b44-billing/Screen";
import { board44Fixture } from "./b44-billing/fixture";
import { Board44Route } from "./b44-billing/Route";
import { Board45Screen } from "./b45-empty-brand/Screen";
import { board45Fixture } from "./b45-empty-brand/fixture";
import { Board45Route } from "./b45-empty-brand/Route";
import { Board46Screen } from "./b46-measurement-failure/Screen";
import { board46Fixture } from "./b46-measurement-failure/fixture";
import { Board46Route } from "./b46-measurement-failure/Route";
import { Board47Screen } from "./b47-level-completion/Screen";
import { board47Fixture } from "./b47-level-completion/fixture";
import { Board47Route } from "./b47-level-completion/Route";

type ScreenComponent = (props: V2ScreenProps<unknown>) => ReactNode;

export type ScreenRegistryEntry = {
  title: string;
  shell: V2ShellVariant;
  Screen: ScreenComponent;
  fixture: unknown;
  Route: () => ReactNode;
};

function bindScreen<TData>(
  screen: (props: V2ScreenProps<TData>) => ReactNode,
  fixture: TData,
): ScreenComponent {
  return ({ staleAsOf }) => screen({ data: fixture, staleAsOf });
}
export const BOARD_IDS: BoardId[] = [
  "b01",
  "b02",
  "b03",
  "b04",
  "b05",
  "b06",
  "b07",
  "b08",
  "b09",
  "b10",
  "b11",
  "b12",
  "b13",
  "b14",
  "b15",
  "b16",
  "b17",
  "b18",
  "b19",
  "b20",
  "b21",
  "b22",
  "b23",
  "b24",
  "b25",
  "b26",
  "b27",
  "b28",
  "b29",
  "b30",
  "b31",
  "b32",
  "b33",
  "b34",
  "b35",
  "b36",
  "b37",
  "b38",
  "b39",
  "b40",
  "b41",
  "b42",
  "b43",
  "b44",
  "b45",
  "b46",
  "b47",
];

export const SCREENS: Record<BoardId, ScreenRegistryEntry> = {
  b01: {
    title: "Today (Guided)",
    shell: "guided",
    Screen: bindScreen(Board01Screen, board01Fixture),
    fixture: board01Fixture,
    Route: Board01Route,
  },
  b02: {
    title: "Today - earlier state (Guided)",
    shell: "guided",
    Screen: bindScreen(Board02Screen, board02Fixture),
    fixture: board02Fixture,
    Route: Board02Route,
  },
  b03: {
    title: "My work - task list (Guided)",
    shell: "guided",
    Screen: bindScreen(Board03Screen, board03Fixture),
    fixture: board03Fixture,
    Route: Board03Route,
  },
  b04: {
    title: "My work - factual correction (Guided)",
    shell: "guided",
    Screen: bindScreen(Board04Screen, board04Fixture),
    fixture: board04Fixture,
    Route: Board04Route,
  },
  b05: {
    title: "My work - confirmation gate (Guided)",
    shell: "guided",
    Screen: bindScreen(Board05Screen, board05Fixture),
    fixture: board05Fixture,
    Route: Board05Route,
  },
  b06: {
    title: "My work - buyer guide editor (Guided)",
    shell: "guided",
    Screen: bindScreen(Board06Screen, board06Fixture),
    fixture: board06Fixture,
    Route: Board06Route,
  },
  b07: {
    title: "Brand facts - Level 1 (Guided)",
    shell: "guided",
    Screen: bindScreen(Board07Screen, board07Fixture),
    fixture: board07Fixture,
    Route: Board07Route,
  },
  b08: {
    title: "Visibility - overview (Expert)",
    shell: "expert",
    Screen: bindScreen(Board08Screen, board08Fixture),
    fixture: board08Fixture,
    Route: Board08Route,
  },
  b09: {
    title: "Visibility - evidence (Expert)",
    shell: "expert",
    Screen: bindScreen(Board09Screen, board09Fixture),
    fixture: board09Fixture,
    Route: Board09Route,
  },
  b10: {
    title: "Visibility - results review (Guided)",
    shell: "guided",
    Screen: bindScreen(Board10Screen, board10Fixture),
    fixture: board10Fixture,
    Route: Board10Route,
  },
  b11: {
    title: "Diagnostics - prompt diagnosis (Expert)",
    shell: "expert",
    Screen: bindScreen(Board11Screen, board11Fixture),
    fixture: board11Fixture,
    Route: Board11Route,
  },
  b12: {
    title: "Diagnostics - GEO signals",
    shell: "expert-nav",
    Screen: bindScreen(Board12Screen, board12Fixture),
    fixture: board12Fixture,
    Route: Board12Route,
  },
  b13: {
    title: "Diagnostics - perception (Expert)",
    shell: "expert",
    Screen: bindScreen(Board13Screen, board13Fixture),
    fixture: board13Fixture,
    Route: Board13Route,
  },
  b14: {
    title: "Learn - personalised path (Guided)",
    shell: "guided",
    Screen: bindScreen(Board14Screen, board14Fixture),
    fixture: board14Fixture,
    Route: Board14Route,
  },
  b15: {
    title: "My work - revision review (Guided)",
    shell: "guided",
    Screen: bindScreen(Board15Screen, board15Fixture),
    fixture: board15Fixture,
    Route: Board15Route,
  },
  b16: {
    title: "My work - publication check (Guided)",
    shell: "guided",
    Screen: bindScreen(Board16Screen, board16Fixture),
    fixture: board16Fixture,
    Route: Board16Route,
  },
  b17: {
    title: "My work - experiment (Guided)",
    shell: "guided",
    Screen: bindScreen(Board17Screen, board17Fixture),
    fixture: board17Fixture,
    Route: Board17Route,
  },
  b18: {
    title: "Diagnostics - site health (Expert)",
    shell: "expert",
    Screen: bindScreen(Board18Screen, board18Fixture),
    fixture: board18Fixture,
    Route: Board18Route,
  },
  b19: {
    title: "My work - content task (Guided)",
    shell: "guided",
    Screen: bindScreen(Board19Screen, board19Fixture),
    fixture: board19Fixture,
    Route: Board19Route,
  },
  b20: {
    title: "Visibility - report (Guided)",
    shell: "guided",
    Screen: bindScreen(Board20Screen, board20Fixture),
    fixture: board20Fixture,
    Route: Board20Route,
  },
  b21: {
    title: "Visibility - outcome review (Guided)",
    shell: "guided",
    Screen: bindScreen(Board21Screen, board21Fixture),
    fixture: board21Fixture,
    Route: Board21Route,
  },
  b22: {
    title: "GEO assistant (Guided)",
    shell: "guided",
    Screen: bindScreen(Board22Screen, board22Fixture),
    fixture: board22Fixture,
    Route: Board22Route,
  },
  b23: {
    title: "Agency dashboard",
    shell: "agency",
    Screen: bindScreen(Board23Screen, board23Fixture),
    fixture: board23Fixture,
    Route: Board23Route,
  },
  b24: {
    title: "Settings (Guided)",
    shell: "guided",
    Screen: bindScreen(Board24Screen, board24Fixture),
    fixture: board24Fixture,
    Route: Board24Route,
  },
  b25: {
    title: "Integrations (Guided)",
    shell: "guided",
    Screen: bindScreen(Board25Screen, board25Fixture),
    fixture: board25Fixture,
    Route: Board25Route,
  },
  b26: {
    title: "Sign in",
    shell: "bare",
    Screen: bindScreen(Board26Screen, board26Fixture),
    fixture: board26Fixture,
    Route: Board26Route,
  },
  b27: {
    title: "Plan selection",
    shell: "bare",
    Screen: bindScreen(Board27Screen, board27Fixture),
    fixture: board27Fixture,
    Route: Board27Route,
  },
  b28: {
    title: "Onboarding - start",
    shell: "bare",
    Screen: bindScreen(Board28Screen, board28Fixture),
    fixture: board28Fixture,
    Route: Board28Route,
  },
  b29: {
    title: "Onboarding - website inspection",
    shell: "bare",
    Screen: bindScreen(Board29Screen, board29Fixture),
    fixture: board29Fixture,
    Route: Board29Route,
  },
  b30: {
    title: "Onboarding - fact review",
    shell: "bare",
    Screen: bindScreen(Board30Screen, board30Fixture),
    fixture: board30Fixture,
    Route: Board30Route,
  },
  b31: {
    title: "Onboarding - buyer questions",
    shell: "bare",
    Screen: bindScreen(Board31Screen, board31Fixture),
    fixture: board31Fixture,
    Route: Board31Route,
  },
  b32: {
    title: "Onboarding - baseline creation",
    shell: "bare",
    Screen: bindScreen(Board32Screen, board32Fixture),
    fixture: board32Fixture,
    Route: Board32Route,
  },
  b33: {
    title: "Onboarding - first baseline review (Guided)",
    shell: "guided",
    Screen: bindScreen(Board33Screen, board33Fixture),
    fixture: board33Fixture,
    Route: Board33Route,
  },
  b34: {
    title: "Brand facts - workspace (Guided)",
    shell: "guided",
    Screen: bindScreen(Board34Screen, board34Fixture),
    fixture: board34Fixture,
    Route: Board34Route,
  },
  b35: {
    title: "Buyer questions - portfolio (Guided)",
    shell: "guided",
    Screen: bindScreen(Board35Screen, board35Fixture),
    fixture: board35Fixture,
    Route: Board35Route,
  },
  b36: {
    title: "Buyer questions - detail (Guided)",
    shell: "guided",
    Screen: bindScreen(Board36Screen, board36Fixture),
    fixture: board36Fixture,
    Route: Board36Route,
  },
  b37: {
    title: "Citation explorer (Guided)",
    shell: "guided",
    Screen: bindScreen(Board37Screen, board37Fixture),
    fixture: board37Fixture,
    Route: Board37Route,
  },
  b38: {
    title: "Competitor gap (Guided)",
    shell: "guided",
    Screen: bindScreen(Board38Screen, board38Fixture),
    fixture: board38Fixture,
    Route: Board38Route,
  },
  b39: {
    title: "My work - queue (Guided)",
    shell: "guided",
    Screen: bindScreen(Board39Screen, board39Fixture),
    fixture: board39Fixture,
    Route: Board39Route,
  },
  b40: {
    title: "Earned media opportunities (Guided)",
    shell: "guided",
    Screen: bindScreen(Board40Screen, board40Fixture),
    fixture: board40Fixture,
    Route: Board40Route,
  },
  b41: {
    title: "Content opportunity inventory (Guided)",
    shell: "guided",
    Screen: bindScreen(Board41Screen, board41Fixture),
    fixture: board41Fixture,
    Route: Board41Route,
  },
  b42: {
    title: "Team and handoff (Guided)",
    shell: "guided",
    Screen: bindScreen(Board42Screen, board42Fixture),
    fixture: board42Fixture,
    Route: Board42Route,
  },
  b43: {
    title: "Notifications and inbox (Guided)",
    shell: "guided",
    Screen: bindScreen(Board43Screen, board43Fixture),
    fixture: board43Fixture,
    Route: Board43Route,
  },
  b44: {
    title: "Billing and usage (Guided)",
    shell: "guided",
    Screen: bindScreen(Board44Screen, board44Fixture),
    fixture: board44Fixture,
    Route: Board44Route,
  },
  b45: {
    title: "Empty new brand (Guided)",
    shell: "guided",
    Screen: bindScreen(Board45Screen, board45Fixture),
    fixture: board45Fixture,
    Route: Board45Route,
  },
  b46: {
    title: "Measurement failure and stale data (Guided)",
    shell: "guided",
    Screen: bindScreen(Board46Screen, board46Fixture),
    fixture: board46Fixture,
    Route: Board46Route,
  },
  b47: {
    title: "Level completion (Guided)",
    shell: "guided",
    Screen: bindScreen(Board47Screen, board47Fixture),
    fixture: board47Fixture,
    Route: Board47Route,
  },
};

export function isBoardId(value: string): value is BoardId {
  return Object.prototype.hasOwnProperty.call(SCREENS, value);
}
