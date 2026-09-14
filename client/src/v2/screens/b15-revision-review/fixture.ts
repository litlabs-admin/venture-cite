import type {
  Board15Claim,
  Board15Content,
  Board15Data,
  Board15TextPart,
  Board15Value,
} from "./Screen";

const measured = <T>(value: T): Board15Value<T> => ({ kind: "measured", value });
const part = (text: string, changed = false): Board15TextPart => ({ text, changed });
const text = (...parts: Board15TextPart[]): Board15Value<readonly Board15TextPart[]> => measured(parts);
const questions = (...items: readonly Board15TextPart[][]): Board15Content["questions"] => measured(items);

const currentContent: Board15Content = {
  title: text(part("How to choose PR support for an early-stage startup")),
  paragraph: text(part("Start with your launch goal, target audience, and available budget.")),
  section: text(part("Questions to ask a PR partner")),
  questions: questions(
    [part("Which startup stages do you support?")],
    [part("What work does the engagement include?")],
    [part("How will we review results?")],
  ),
};

const proposedContent: Board15Content = {
  title: text(part("How to choose PR support for an "), part("early-stage startup", true)),
  paragraph: text(
    part("Start with your launch goal, target audience, available budget, "),
    part("and industry specialization.", true),
  ),
  section: text(part("Questions to ask a PR partner")),
  questions: questions(
    [part("Which startup stages and industries do you support?", true)],
    [part("What work does the engagement include?")],
    [part("How will we "), part("measure and review results?", true)],
  ),
};

const claims: readonly Board15Claim[] = [
  {
    id: "claim-1",
    current: text(part("How to choose PR support for an early-stage startup")),
    proposed: text(part("How to choose PR support for an "), part("early-stage startup", true)),
    evidence: {
      kind: "confirmed",
      sourceLabel: "Approved fact",
      sourceUrl: "https://venturecite.com/startup-stages",
    },
  },
  {
    id: "claim-2",
    current: text(part("Start with your launch goal, target audience, and available budget.")),
    proposed: text(
      part("Start with your launch goal, target audience, available budget, "),
      part("and industry specialization.", true),
    ),
    evidence: {
      kind: "confirmed",
      sourceLabel: "Approved fact",
      sourceUrl: "https://venturecite.com/pr-services",
    },
  },
  {
    id: "claim-3",
    current: text(part("Which startup stages do you support?")),
    proposed: text(
      part("Which startup stages "),
      part("and\nindustries", true),
      part(" do you support?"),
    ),
    evidence: {
      kind: "not-confirmed",
      message: "Not found in approved facts",
    },
  },
];

export const board15Fixture: Board15Data = {
  context: measured("Prototype · Sample data"),
  revision: {
    currentPublishedAt: measured("Jul 10, 2024"),
    proposedEditedAt: measured("today, 10:24 AM"),
    changeCount: measured(3),
    currentContent,
    proposedContent,
    approvalState: "blocked",
    rewardPoints: measured(20),
  },
  claims: measured(claims),
};
