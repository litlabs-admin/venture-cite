// Learn's six lessons, as static typed content.
//
// There is no lesson-authoring UI and no lessons table: the course is small,
// changes rarely, and ships as code the same way shared/siteHealthFindings.ts
// ships its own fixed catalog. The only thing that needs persistence is which
// of these ids a given user has completed - server/routes/v2Learn.ts owns
// that, not this file.
//
// Every claim in a lesson traces to a specific finding in
// docs/research/venturecite-geo-product-audit.md (2026-09-07) or
// docs/research/2026-09-08-venturecite-expanded-assessment.md. Where the
// underlying research hedges ("a model proxy, not a native measurement"), the
// lesson keeps that hedge - a lesson that overclaims what this product
// measures would be teaching the exact mistake those audits flag.

export const V2_LESSON_IDS = [
  "ai-answer-visibility",
  "citations-and-source-trust",
  "buyer-question-design",
  "site-accessibility-for-ai",
  "experiment-limits",
  "outcome-attribution",
] as const;

export type V2LessonId = (typeof V2_LESSON_IDS)[number];

export function isV2LessonId(value: unknown): value is V2LessonId {
  return typeof value === "string" && (V2_LESSON_IDS as readonly string[]).includes(value);
}

/**
 * Six of client/src/v2/contracts/icons.ts's V2IconName values, typed locally
 * instead of imported from there. This file is imported by both the client
 * bundle and server/routes/v2Learn.ts; the server has no "@/*" (client/src)
 * alias, so importing a client-aliased path here would break the server
 * build. tests/unit/v2Board14.test.tsx checks every literal below is still a
 * real icon name in that contract.
 */
export type V2LessonIcon = "vis" | "doc" | "q" | "globe" | "diag" | "scale";

export type V2LessonSection = {
  heading: string;
  paragraphs: readonly string[];
};

export type V2Lesson = {
  id: V2LessonId;
  title: string;
  description: string;
  durationMinutes: number;
  /** `durationMinutes * V2_LESSON_POINTS_PER_MINUTE`, stored rather than
   *  recomputed at every call site - a future lesson can use a different
   *  point value without every reader needing to know the formula changed. */
  points: number;
  icon: V2LessonIcon;
  goals: readonly string[];
  sections: readonly V2LessonSection[];
};

export const V2_LESSON_POINTS_PER_MINUTE = 5;

function defineLesson(input: Omit<V2Lesson, "points">): V2Lesson {
  return { ...input, points: input.durationMinutes * V2_LESSON_POINTS_PER_MINUTE };
}

export const V2_LESSONS: readonly V2Lesson[] = [
  defineLesson({
    id: "ai-answer-visibility",
    title: "AI answer visibility",
    description: "Learn how AI systems find and choose content to include in their answers.",
    durationMinutes: 6,
    icon: "vis",
    goals: [
      "Tell apart mention, answer presence, recommendation, and citation as separate events",
      "Read a visibility score by its denominator instead of taking the headline number on faith",
      "Know which engine checks are native measurements and which are proxies",
    ],
    sections: [
      {
        heading: "Five events, not one score",
        paragraphs: [
          "A brand's name appearing somewhere in an AI answer is a mention. That is not the same as answer presence (the answer actually addresses what was asked), a recommendation (the answer endorses the brand as a choice), a source citation (a link backs the claim), or a ranked position. Treating any one of these as a stand-in for the others is where a visibility number stops meaning what it claims to mean.",
          "A matcher that only checks whether a brand name appears anywhere in the response text can mark an answer as citing the brand even when the brand is only mentioned in passing. The fix is to store each of the five events separately, with the exact span of text that supports it, rather than collapsing them into one yes-or-no flag.",
        ],
      },
      {
        heading: "A native surface is not the same as a proxy",
        paragraphs: [
          "Checking a model through its API is a reasonable way to sample how that model tends to answer, but it is not the same as observing the actual ChatGPT search surface, Google AI Overviews, or Copilot the way a real user would see them. A model-proxy check and a retrieval-proxy check (a web-grounded model) both produce useful signal, but neither is a native-surface measurement.",
          'Until a platform\'s real surface is measured directly, the honest label for it is "not measured" - not a zero, and not silence. A missing check and a checked-and-absent result are different facts, and they need to stay visibly different.',
        ],
      },
      {
        heading: "Read the sample size before the score",
        paragraphs: [
          "A rate built from fewer than about twenty observations is closer to noise than to a measurement; the honest response is to say so rather than print a precise-looking percentage. Twenty to sixty observations supports a range with low confidence; sixty or more supports a stated estimate.",
          'Two numbers that look contradictory - "22% this run" and "20% over 30 days" - are usually both correct once each one names its window, its denominator, and its prompt version. A visibility number without those three labels attached is not yet a comparable measurement.',
        ],
      },
      {
        heading: "What this means for your score on this account",
        paragraphs: [
          "The visibility figures elsewhere in this product describe the prompts and engines currently tracked for your brand - not the full space of things a buyer might ask, and not every AI surface that exists. Adding more buyer-question prompts changes what is being observed, not just how well the brand happens to do on the ones already tracked.",
        ],
      },
    ],
  }),
  defineLesson({
    id: "citations-and-source-trust",
    title: "Citations and source trust",
    description: "Understand what builds source credibility and how to earn more citations.",
    durationMinutes: 8,
    icon: "doc",
    goals: [
      "Explain what turns a mention into a citation worth counting",
      "List the fields a source record needs before it can be called verified",
      "Explain why an inferred value sits below a community source in the trust hierarchy",
    ],
    sections: [
      {
        heading: "A mention is not a citation",
        paragraphs: [
          "An AI answer can name a brand and link to a source that has nothing to do with that brand's claim. A citing-source field that falls back to the first URL in the answer when no clearer signal exists will do exactly this - the first URL in a long answer is not reliably the one supporting the brand's mention.",
          "A citation worth counting needs the claim span (what the answer said) and the source span (what the source actually says) linked to each other, not just a URL sitting near a brand name.",
        ],
      },
      {
        heading: "What a trustworthy source record holds",
        paragraphs: [
          "Source URL and title are the minimum. A defensible record also carries the source type, its authority, its relevance to the specific claim, how recent it is, and a stated confidence in the attribution.",
          "Those fields are easy to skip and expensive to skip: on one brand's 230 recorded citation observations, fewer than a fifth carried a relevance score, roughly half carried an authority score, and over a hundred rows had no source type recorded at all. The response is not to hide the resulting score - it is to show its coverage next to it, so a number built on thin enrichment reads differently from one that isn't.",
        ],
      },
      {
        heading: "The source hierarchy",
        paragraphs: [
          "Not every source deserves equal weight. A user-approved primary source outranks an official product or legal page, which outranks a reliable first-party feed or filing, which outranks an independent high-quality publication, which outranks a community source, which outranks an inferred or generated value.",
          "An inferred value belongs at the bottom of that list, and it should never appear in the same visual class as a fact a human has verified. Blurring that distinction is how a guess quietly gets treated as a checked fact.",
        ],
      },
      {
        heading: "Trust needs more than sentiment",
        paragraphs: [
          "Owned pages, earned editorial coverage, community threads, social posts, reviews, paid placements, and user-generated video are different source classes with different trust profiles. A mention monitor that only watches one or two of them is not covering the earned-media picture.",
          "Sentiment alone - positive, negative, neutral - says nothing about whether a claim is accurate or whether its source is credible. A source record worth trusting states sentiment, claim accuracy, recommendation strength, and source credibility as four separate judgments, not one blended tone.",
        ],
      },
    ],
  }),
  defineLesson({
    id: "buyer-question-design",
    title: "Buyer-question design",
    description: "Create content that directly answers the questions your buyers ask AI tools.",
    durationMinutes: 7,
    icon: "q",
    goals: [
      "Explain why a prompt set built only from listicle-style questions under-measures buyer intent",
      "Use a nine-class buyer-question portfolio instead of one prompt shape",
      "Name the provenance fields a tracked prompt needs before its results can be trusted",
    ],
    sections: [
      {
        heading: "The listicle trap",
        paragraphs: [
          'A prompt set that forces every question into a "best X for Y" shape measures one thing well: whether a brand shows up in vendor-comparison lists. It does not measure whether the brand answers a troubleshooting question, a pricing question, or a trust question - and buyers ask all of those.',
          "That narrowing is a selection bias, not a neutral simplification. A brand can score well on listicle-style prompts while staying invisible on the buying-decision and pricing prompts that actually precede a purchase.",
        ],
      },
      {
        heading: "A real portfolio has nine classes",
        paragraphs: [
          "A defensible starting mix spreads across nine kinds of buyer question: category discovery, problem-solving, comparison, alternatives, buying decision, pricing and implementation, trust and reputation, brand facts, and negative or crisis questions. A reasonable starting split gives category discovery, problem-solving, comparison, and buying decision roughly 15% each; alternatives, pricing, and trust roughly 10% each; and brand facts and negative prompts roughly 5% each - tuned from there against real customer goals and observed demand, not treated as a fixed rule.",
          "The point of naming the classes is coverage, not the exact percentages: a ten-prompt set that is entirely comparison questions is not a portfolio, no matter how well it performs.",
        ],
      },
      {
        heading: "Give every prompt a paper trail",
        paragraphs: [
          "A prompt worth tracking carries more than its text: where it came from (customer input, a search query, a sales call, a generated suggestion), who is asking (persona, language, country), what device or surface, what the person is trying to get done, and a demand estimate with its own source and date.",
          "Without that trail, a prompt set can't be explained later - nobody can say why a given question is still being tracked, or whether it still matters.",
        ],
      },
      {
        heading: "Keep a stable core",
        paragraphs: [
          "A locked canary set that never changes lets a score movement over time mean something. A flexible growth set absorbs new buyer questions as they emerge. A retired set keeps history without polluting the active comparison. Reporting canary and growth results separately keeps a score change from adding new prompts from ever being mistaken for a real shift in visibility.",
        ],
      },
    ],
  }),
  defineLesson({
    id: "site-accessibility-for-ai",
    title: "Site accessibility for AI",
    description: "Make it easy for AI crawlers to access, read, and understand your content.",
    durationMinutes: 6,
    icon: "globe",
    goals: [
      "Explain why an allowed robots.txt line does not by itself guarantee access",
      "Name the difference between a training crawler and a search crawler for at least one provider",
      "Explain why structured data has to match the visible page, not just be technically valid",
    ],
    sections: [
      {
        heading: "robots.txt is a request, not a lock",
        paragraphs: [
          "The robots exclusion protocol (RFC 9309) is a published request that well-behaved crawlers agree to honor - it carries no technical enforcement. A brand that needs to keep something away from every crawler needs authentication or a server-side control, not a Disallow line.",
          "The reverse also holds: an Allow line does not guarantee a crawler will actually retrieve and use the page. It only removes one known obstacle.",
        ],
      },
      {
        heading: "One provider, several crawler identities",
        paragraphs: [
          "OpenAI documents three distinct crawler identities with different jobs: GPTBot (training), OAI-SearchBot (search), and ChatGPT-User (fetching on behalf of a live user request). Allowing one of these in robots.txt does not allow the others - a site that blocks GPTBot but means to stay reachable in ChatGPT's search results has not necessarily achieved that.",
          "Perplexity documents a similar split between its indexing crawler and its user-triggered fetcher, and its own published guidance has changed over time. The safe habit is to record the date a crawler policy was checked and the source it came from, rather than treat a rule as permanent.",
        ],
      },
      {
        heading: "Structured data has to match the page",
        paragraphs: [
          "Google's own guidance is explicit: structured data must describe what is actually visible on the page, and adding it does not itself guarantee an AI citation. Markup is a hint to a retrieval system, not a lever that moves a citation rate on its own.",
          'A claim like "this markup boosts citations" is a hypothesis worth testing against your own prompts, not a promise this lesson - or this product - can make on its own.',
        ],
      },
      {
        heading: "Three groups of prerequisites",
        paragraphs: [
          "Access covers indexing, rendering, robots rules, sitemaps, and response status codes - these gate whether a retrieval path can reach the page at all. Source quality covers facts, evidence, authorship, references, and freshness. Distribution covers earned coverage, community presence, product feeds, and publisher relationships.",
          'A useful accessibility fix names what it is required for, and what it does not prove. "Required for this retrieval path to reach the page" and "not measured: citation lift" can both be true about the same fix at the same time.',
        ],
      },
    ],
  }),
  defineLesson({
    id: "experiment-limits",
    title: "Experiment limits",
    description: "Learn what kinds of changes reliably move visibility — and what doesn't.",
    durationMinutes: 5,
    icon: "diag",
    goals: [
      "State why one changed answer is not proof a change worked",
      "Run a check through the same repeatable sequence every time",
      'Use the five outcome labels instead of "it worked" or "it didn\'t"',
    ],
    sections: [
      {
        heading: "One answer changing is not proof",
        paragraphs: [
          "Generative answers are documented to vary with time, location, and personalization, and to shift over intervals as short as minutes to days - independent of anything a brand changed. A single before-and-after check, with no repeated sampling and no stable comparison set, mostly measures that background variability, not the change.",
          "This is a limit on what a quick recheck can tell you, not a reason to skip rechecking. It is a reason to design the recheck properly.",
        ],
      },
      {
        heading: "A repeatable sequence",
        paragraphs: [
          "Record the prompt version being tested. Run at least two repeated samples per engine before changing anything, so the baseline's own noise is known. Capture the full answer and its sources, not just whether the brand appeared. Write down the change and the expected direction before making it.",
          "Then change one source class, wait the crawl or update window that provider documents, and re-run the exact same prompt and configuration. Compare the result against a stable canary set that did not change, and record any traffic or lead evidence available. Only then label the outcome.",
        ],
      },
      {
        heading: "Five honest outcome labels",
        paragraphs: [
          "Supported: the lift persists across repeated samples and a stable comparison. Directional: the metric moved, but the sample or the comparison was weak. Unclear: the engine or the prompt itself changed during the test. Failed: the target metric did not improve. Not measurable: the platform or the source didn't provide enough evidence either way.",
          'None of these five is a synonym for "it worked" or "it didn\'t." Using the specific label is what keeps a mission\'s evidence honest enough to build the next decision on.',
        ],
      },
      {
        heading: "Change one thing at a time",
        paragraphs: [
          "Testing two source changes in the same window makes it impossible to say which one, if either, moved the result. A locked canary prompt set that never changes is what lets a real movement be told apart from a prompt-set change that only looks like one.",
        ],
      },
    ],
  }),
  defineLesson({
    id: "outcome-attribution",
    title: "Outcome attribution",
    description: "Connect your changes to measurable visibility outcomes.",
    durationMinutes: 7,
    icon: "scale",
    goals: [
      "Keep work progress, observed visibility, and business results as three separate records",
      "State what has to be true before a verified work point can be earned",
      "Explain why a later visibility decline does not reverse an already-earned work point",
    ],
    sections: [
      {
        heading: "Three records, not one number",
        paragraphs: [
          "Work progress tracks verified, completed work - a fact approved, a crawl block fixed, a page published and confirmed reachable. Observed AI visibility tracks presence, recommendation, citation, and source support as measured on tracked prompts. Business results - traffic, leads, revenue - are a third, separate record.",
          "Collapsing these three into one number is how a completed task quietly turns into an unsupported claim that revenue moved. Keeping them separate is what lets each one stay honest about what it actually shows.",
        ],
      },
      {
        heading: "What earns a verified point",
        paragraphs: [
          "A task has to reference the correct brand, with access to that brand confirmed. Its measurement scope has to be frozen - the exact prompt version, provider, date window, and denominator recorded, not silently swapped out later. It needs retained evidence: a source URL, a retrieval result, an excerpt, and a timestamp, not a generated answer treated as its own proof.",
          "A human has to approve any externally visible claim before it counts, and each task version gets exactly one award key, so retrying a stalled job can never pay out twice for the same work. A page generated but never published, a checklist item clicked, or a prompt count going up are not verified work - none of them is evidence that anything real changed.",
        ],
      },
      {
        heading: "Visibility moves on its own",
        paragraphs: [
          "A verified work point, once earned, stays earned even if a later visibility check comes back lower - the work was still done correctly, and it is the visibility record that should update, not the work record. The two are allowed to disagree, and often will, because visibility depends on things outside any single brand's control.",
          "This is also this page's own boundary: the learning points below track progress through this course. They are not a work point and not a visibility measurement - completing every lesson here changes nothing about a brand's score.",
        ],
      },
      {
        heading: "Business results need their own evidence",
        paragraphs: [
          "A lead or a revenue event is a business record with its own source, date, and attribution rule - and the honest default is to call it an observed association, not a proven cause, unless a real experiment backs it up.",
          "Citation counts on their own are not evidence of revenue. Letting a citation number quietly imply a dollar figure is a claim the measurement can't support.",
        ],
      },
    ],
  }),
];

export const V2_TOTAL_LESSON_MINUTES = V2_LESSONS.reduce(
  (total, current) => total + current.durationMinutes,
  0,
);
export const V2_TOTAL_LESSON_POINTS = V2_LESSONS.reduce(
  (total, current) => total + current.points,
  0,
);

export function getV2Lesson(id: string): V2Lesson | undefined {
  return V2_LESSONS.find((candidate) => candidate.id === id);
}

export function getV2LessonIndex(id: string): number {
  return V2_LESSONS.findIndex((candidate) => candidate.id === id);
}

/** The lesson after `id` in course order, or `null` at the last lesson or for
 *  an unknown id. */
export function getNextV2LessonId(id: string): V2LessonId | null {
  const index = getV2LessonIndex(id);
  if (index === -1 || index === V2_LESSONS.length - 1) return null;
  return V2_LESSONS[index + 1].id;
}
