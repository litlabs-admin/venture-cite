import type { Board19Data } from "./Screen";

const measured = <T>(value: T) => ({ kind: "measured" as const, value });

export const board19Fixture: Board19Data = {
  board: "services",
  brandId: "brand-venture-pr",
  task: {
    id: "content-services-clarity",
    revision: 0,
    title: measured("Clarify your services for startup buyers"),
    state: "edit_page",
    steps: [
      { label: "Review brief", caption: "Completed", status: "completed" },
      { label: "Edit page", caption: "Active", status: "active" },
      { label: "Verify publication", caption: "Pending", status: "pending" },
    ],
    buyerNeed: measured(
      "Understand what PR services you offer and how they help early-stage startups.",
    ),
    sourceEvidence: measured("Approved brand facts about services, results, and outcomes."),
    completionRequirements: measured([
      "Publish the updated page",
      "Confirm the claims",
      "Verify the published URL",
    ]),
    pointsAfterVerification: measured(40),
  },
  draft: {
    articleId: measured("article-services-1"),
    status: measured("Draft saved"),
    title: measured("Our services for early-stage startups"),
    body: measured(
      "We help early-stage startups get the visibility, credibility, and traction they need by connecting them with the right media, audiences, and partners.\n\n### Media relations and press coverage\n\nWe develop strategic PR campaigns that earn coverage in leading technology and business media. Our team has secured coverage for over 250 startups in the last three years, including in TechCrunch, Forbes, and Bloomberg. [1]\n\n- Media strategy and outreach\n- Press releases and story development\n- Founder and executive thought leadership\n\n### Content and thought leadership\n\nWe create high-quality content that positions your founders as expert voices and helps you reach the right audiences. Startups that publish consistent thought leadership see higher inbound interest from investors and customers. [2]\n\n- Bylined articles and op-eds\n- Guest content and contributed posts\n- Executive interview support\n\n### Launch and milestone support\n\nFrom product launches to funding announcements, we help you tell your story at key moments. Our launch support has helped startups drive significant increases in website traffic and demo requests. [3]\n\n- Launch messaging and positioning\n- Coordinated media outreach\n- Real-time support during announcements\n\n[1] Approved brand fact: Secured coverage for 250+ startups in the last three years\n[2] Approved brand fact: Startups that publish consistent thought leadership see higher inbound interest\n[3] Approved brand fact: Launch support drives significant increases in website traffic and demo requests",
    ),
    questions: {
      kind: "not-measured",
      reason: "Buyer questions are not part of the services-page task contract.",
    },
    sections: [
      {
        kind: "paragraph",
        text: measured(
          "We help early-stage startups get the visibility, credibility, and traction they need by connecting them with the right media, audiences, and partners.",
        ),
      },
      { kind: "heading", text: measured("Media relations and press coverage") },
      {
        kind: "paragraph",
        text: measured(
          "We develop strategic PR campaigns that earn coverage in leading technology and business media. Our team has secured coverage for over 250 startups in the last three years, including in TechCrunch, Forbes, and Bloomberg. [1]",
        ),
      },
      {
        kind: "bullets",
        items: [
          measured("Media strategy and outreach"),
          measured("Press releases and story development"),
          measured("Founder and executive thought leadership"),
        ],
      },
      { kind: "heading", text: measured("Content and thought leadership") },
      {
        kind: "paragraph",
        text: measured(
          "We create high-quality content that positions your founders as expert voices and helps you reach the right audiences. Startups that publish consistent thought leadership see higher inbound interest from investors and customers. [2]",
        ),
      },
      {
        kind: "bullets",
        items: [
          measured("Bylined articles and op-eds"),
          measured("Guest content and contributed posts"),
          measured("Executive interview support"),
        ],
      },
      { kind: "heading", text: measured("Launch and milestone support") },
      {
        kind: "paragraph",
        text: measured(
          "From product launches to funding announcements, we help you tell your story at key moments. Our launch support has helped startups drive significant increases in website traffic and demo requests. [3]",
        ),
      },
      {
        kind: "bullets",
        items: [
          measured("Launch messaging and positioning"),
          measured("Coordinated media outreach"),
          measured("Real-time support during announcements"),
        ],
      },
    ],
    savedAt: measured("2026-09-09T10:24:00"),
    footnotes: measured([
      "[1] Approved brand fact: Secured coverage for 250+ startups in the last three years",
      "[2] Approved brand fact: Startups that publish consistent thought leadership see higher inbound interest",
      "[3] Approved brand fact: Launch support drives significant increases in website traffic and demo requests",
    ]),
    citationCount: measured(3),
  },
  publication: {
    url: measured("/services"),
    verified: measured(false),
  },
  toast: measured("Draft saved. Publication is not yet verified."),
};
