import type { Board06Data } from "./Screen";

const measured = <T>(value: T) => ({ kind: "measured" as const, value });

export const board06Fixture: Board06Data = {
  board: "buyer-guide",
  brandId: "brand-venture-pr",
  task: {
    id: "improve-buyer-guide",
    revision: 0,
    title: measured("Improve your startup PR guide"),
    state: "edit",
    steps: [
      { label: "Review brief", caption: "Completed", status: "completed" },
      { label: "Edit page", caption: "Active", status: "active" },
      { label: "Verify publication", caption: "Pending", status: "pending" },
    ],
    buyerNeed: measured("Compare PR services before contacting a provider."),
    sourceEvidence: measured("Approved buyer question set"),
    completionRequirements: measured([
      "Publish the updated page",
      "Confirm the claims",
      "Verify the published URL",
    ]),
    pointsAfterVerification: measured(40),
  },
  draft: {
    articleId: measured("article-buyer-guide-1"),
    status: measured("Draft saved"),
    title: measured("How to choose PR support for an early-stage startup"),
    body: measured(
      "Start with your launch goal, target audience, and available budget.\n\n## Questions to ask a PR partner\n\n- Which startup stages do you support?\n- What work does the engagement include?\n- How will we review results?\n\n## What a good answer looks like\n\nName the stages you support, the deliverables in a typical engagement, and how results are reviewed. Buyers comparing providers are looking for those three answers in order.\n\n## Where this page is cited\n\nThis guide is the page most often retrieved for comparison questions about early-stage PR in India.\n\n[1] Approved brand facts",
    ),
    questions: measured([
      "Which startup stages do you support?",
      "What work does the engagement include?",
      "How will we review results?",
    ]),
    sections: [
      {
        kind: "paragraph",
        text: measured("Start with your launch goal, target audience, and available budget."),
      },
      { kind: "heading", text: measured("Questions to ask a PR partner") },
      {
        kind: "bullets",
        items: [
          measured("Which startup stages do you support?"),
          measured("What work does the engagement include?"),
          measured("How will we review results?"),
        ],
      },
      { kind: "heading", text: measured("What a good answer looks like") },
      {
        kind: "paragraph",
        text: measured(
          "Name the stages you support, the deliverables in a typical engagement, and how results are reviewed. Buyers comparing providers are looking for those three answers in order.",
        ),
      },
      { kind: "heading", text: measured("Where this page is cited") },
      {
        kind: "paragraph",
        text: measured(
          "This guide is the page most often retrieved for comparison questions about early-stage PR in India.",
        ),
      },
    ],
    savedAt: measured("2026-09-09T10:24:00"),
    footnotes: measured(["[1] Approved brand facts"]),
    citationCount: measured(1),
  },
  publication: {
    url: measured("/buyer-guide"),
    verified: measured(false),
  },
  toast: measured("Draft saved. Publication is not yet verified."),
};
