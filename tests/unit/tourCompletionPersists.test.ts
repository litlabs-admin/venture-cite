// @vitest-environment happy-dom
//
// REGRESSION GUARD: a tour the user finishes must persist, so it never
// auto-fires again.
//
// The bug this pins: step numbering was taken from `config.steps`, but steps
// whose DOM target is absent are silently dropped. With a tail step missing,
// no RENDERED step ever satisfied `index === config.steps.length - 1`, so the
// last visible step showed "Next" instead of "Done", Shepherd completed
// itself, and `onComplete` - the sole caller of markCompleted - never ran.
// Nothing was written, and the tour reappeared on every single page load.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { runTour } from "@/tours/engine/shepherdAdapter";
import { globalWelcomeTour } from "@/tours/global-welcome.tour";
import type { TourConfig, TourContext } from "@/tours/types";

const ctx: TourContext = {
  userId: "u-1",
  brandId: null,
  isAdmin: false,
  counts: { brands: 1, mentions: 0, citations: 0, articles: 0, prompts: 0 },
};

// The real EventBuffer batches over a timer; only push() is exercised here.
const buffer = { push: vi.fn() } as unknown as Parameters<typeof runTour>[0]["buffer"];

function anchor(tourId: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-tour-id", tourId);
  // happy-dom reports 0×0 for everything; findByTourId treats that as
  // "not on screen", so give the anchors a real box.
  el.getBoundingClientRect = () => ({ width: 100, height: 20 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

/** Click the button with the given label in the visible Shepherd step. */
function clickButton(label: string): boolean {
  const btn = [...document.querySelectorAll<HTMLElement>(".shepherd-button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!btn) return false;
  btn.click();
  return true;
}

const flush = () => new Promise((r) => setTimeout(r, 20));

/** Step ids the engine dropped because their target wasn't on screen. */
function droppedStepIds(): string[] {
  return (
    buffer.push as unknown as { mock: { calls: [{ eventType: string; stepId: string }][] } }
  ).mock.calls
    .filter(([e]) => e.eventType === "tour_step_target_missing")
    .map(([e]) => e.stepId);
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  // Shepherd starts the tour inside rAF; happy-dom has it, but keep it prompt.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    setTimeout(() => cb(0), 0);
    return 0;
  });
});

// Two steps; the SECOND one's anchor is deliberately never added to the DOM,
// so only step one renders. That is the exact shape that dropped the write.
const tourWithMissingTailStep: TourConfig = {
  id: "global-welcome",
  version: 2,
  scope: "global",
  trigger: { kind: "route", routes: ["/"] },
  steps: [
    { id: "first", target: "test.present", content: "one", waitForTarget: false },
    { id: "tail", target: "test.absent", content: "two", waitForTarget: false },
  ],
};

describe("tour completion persists when a tail step's target is missing", () => {
  it("labels the last RENDERED step 'Done' and fires onComplete", async () => {
    anchor("test.present"); // "test.absent" intentionally omitted

    const onComplete = vi.fn();
    runTour({ config: tourWithMissingTailStep, ctx, mode: "auto", buffer, onComplete });
    await flush();

    // Before the fix this button read "Next": the sole rendered step sat at
    // config index 0 while the "last" index was 1.
    expect(clickButton("Done")).toBe(true);
    await flush();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("offers no Skip on the only rendered step, so it cannot be half-dismissed", async () => {
    anchor("test.present");

    runTour({ config: tourWithMissingTailStep, ctx, mode: "auto", buffer, onComplete: vi.fn() });
    await flush();

    // Skip is for "I don't want the REST of this" - meaningless when the
    // step in front of you is the last one. Previously it appeared here
    // because the count came from config, not from what rendered.
    expect(clickButton("Skip")).toBe(false);
  });
});

describe("tour completion persists when every step renders", () => {
  it("fires onComplete on the final step", async () => {
    anchor("test.present");
    anchor("test.second");

    const onComplete = vi.fn();
    runTour({
      config: {
        ...tourWithMissingTailStep,
        steps: [
          { id: "first", target: "test.present", content: "one", waitForTarget: false },
          { id: "second", target: "test.second", content: "two", waitForTarget: false },
        ],
      },
      ctx,
      mode: "auto",
      buffer,
      onComplete,
    });
    await flush();

    expect(clickButton("Next")).toBe(true);
    await flush();
    expect(clickButton("Done")).toBe(true);
    await flush();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

// Shepherd funnels the Skip button, "Don't show again", the X icon and Esc
// through a single `cancel` event. Each ending must persist exactly one
// outcome - never two, never none.
describe("every terminal path settles exactly once", () => {
  const twoStep = {
    ...tourWithMissingTailStep,
    steps: [
      { id: "first", target: "test.present", content: "one", waitForTarget: false },
      { id: "second", target: "test.second", content: "two", waitForTarget: false },
    ],
  } as TourConfig;

  const handlers = () => ({
    onComplete: vi.fn(),
    onSkip: vi.fn(),
    onSkipForever: vi.fn(),
    onEnd: vi.fn(),
  });

  it("persists a skip when the tour is dismissed with the X icon", async () => {
    // Previously X/Esc persisted NOTHING - the dominant ending in production
    // (82 abandons vs 6 completions) and the reason the tour came back on
    // every single page load.
    anchor("test.present");
    anchor("test.second");
    const h = handlers();
    runTour({ config: twoStep, ctx, mode: "auto", buffer, ...h });
    await flush();

    document.querySelector<HTMLElement>(".shepherd-cancel-icon")?.click();
    await flush();

    expect(h.onSkip).toHaveBeenCalledTimes(1);
    expect(h.onComplete).not.toHaveBeenCalled();
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  it("persists a skip exactly once from the Skip button (not twice via cancel)", async () => {
    anchor("test.present");
    anchor("test.second");
    const h = handlers();
    runTour({ config: twoStep, ctx, mode: "auto", buffer, ...h });
    await flush();

    expect(clickButton("Skip")).toBe(true);
    await flush();

    // The button records intent and calls tour.cancel(); the cancel handler
    // is what persists. Both firing would double-PATCH.
    expect(h.onSkip).toHaveBeenCalledTimes(1);
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  it("persists suppression, not a skip, from 'Don't show again'", async () => {
    anchor("test.present");
    anchor("test.second");
    const h = handlers();
    runTour({ config: twoStep, ctx, mode: "auto", buffer, ...h });
    await flush();

    expect(clickButton("Don't show again")).toBe(true);
    await flush();

    expect(h.onSkipForever).toHaveBeenCalledTimes(1);
    expect(h.onSkip).not.toHaveBeenCalled();
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  it("persists nothing on a programmatic cancel, but still releases the slot", async () => {
    // Brand switch / route change is internal navigation, not user intent.
    anchor("test.present");
    anchor("test.second");
    const h = handlers();
    const running = runTour({ config: twoStep, ctx, mode: "auto", buffer, ...h });
    await flush();

    running.cancel("brand_switched");
    await flush();

    expect(h.onSkip).not.toHaveBeenCalled();
    expect(h.onComplete).not.toHaveBeenCalled();
    expect(h.onSkipForever).not.toHaveBeenCalled();
    // Without this the orchestrator's activeRef stays set and no further
    // tour can fire for the rest of the session.
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  it("never persists in manual replay mode, however it ends", async () => {
    anchor("test.present");
    anchor("test.second");
    const h = handlers();
    runTour({ config: twoStep, ctx, mode: "manual", buffer, ...h });
    await flush();

    clickButton("Next");
    await flush();
    clickButton("Done");
    await flush();

    expect(h.onComplete).not.toHaveBeenCalled();
    expect(h.onSkip).not.toHaveBeenCalled();
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  it("releases the slot when no step could render at all", async () => {
    const h = handlers();
    const onNoShow = vi.fn();
    // Neither anchor added - nothing resolves.
    runTour({
      config: {
        ...twoStep,
        steps: [{ id: "only", target: "test.absent", content: "x", waitForTarget: false }],
      },
      ctx,
      mode: "auto",
      buffer,
      ...h,
      onNoShow,
    });
    await flush();

    expect(onNoShow).toHaveBeenCalledTimes(1);
    expect(h.onSkip).not.toHaveBeenCalled();
    expect(h.onComplete).not.toHaveBeenCalled();
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });
});

describe("global-welcome degrades to the mobile path below the lg breakpoint", () => {
  // Production, 2026-07-30: sidebar-setup missed 76 times, sidebar-monitor 60,
  // brand-selector 45. All of them live in `hidden lg:flex` chrome, so under
  // 1024px they cannot resolve and the tour collapsed to its one anchorless
  // step. nav.mobileToggle is the counterpart; the two are mutually exclusive
  // by breakpoint, so the engine picks between them with no viewport check.
  const noWait = {
    ...globalWelcomeTour,
    steps: globalWelcomeTour.steps.map((s) => ({ ...s, waitForTarget: false })),
  };

  it("renders intro + the mobile step and can be completed", async () => {
    anchor("nav.mobileToggle"); // no desktop sidebar, no context bar
    anchor("sidebar.chatbot"); // fixed-position, present at every width

    const onComplete = vi.fn();
    runTour({ config: noWait, ctx, mode: "auto", buffer, onComplete });
    await flush();

    // intro (anchorless) -> mobile-nav -> chatbot. The five nav.* steps and
    // brand-selector drop out.
    expect(clickButton("Next")).toBe(true);
    await flush();
    expect(clickButton("Next")).toBe(true);
    await flush();
    expect(clickButton("Done")).toBe(true);
    await flush();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("renders the five sidebar steps and not the mobile step at lg and above", async () => {
    for (const t of [
      "nav.setup",
      "nav.monitor",
      "nav.diagnose",
      "nav.act",
      "nav.report",
      "sidebar.brandSelector",
      "sidebar.chatbot",
    ])
      anchor(t);

    runTour({ config: noWait, ctx, mode: "auto", buffer, onComplete: vi.fn() });
    await flush();

    expect(droppedStepIds()).toContain("mobile-nav");
    expect(droppedStepIds()).not.toContain("sidebar-setup");
  });
});

describe("missing anchors do not delay the tour additively", () => {
  it("resolves every step concurrently, so N dead anchors cost one timeout", async () => {
    // Found live: on a sub-1024px viewport the welcome tour has six anchors
    // that can never resolve. Sequential waits made the 3s timeouts additive
    // and the first panel took ~20s to paint. Production agrees - the
    // tour_step_target_missing events are ~4s apart.
    const TIMEOUT = 120;
    const dead = Array.from({ length: 5 }, (_, i) => ({
      id: `dead-${i}`,
      target: `test.absent${i}`,
      content: "x",
      waitTimeoutMs: TIMEOUT,
    }));

    anchor("test.present");
    const started = Date.now();
    runTour({
      config: {
        ...tourWithMissingTailStep,
        steps: [
          ...dead,
          { id: "real", target: "test.present", content: "one", waitForTarget: false },
        ],
      } as TourConfig,
      ctx,
      mode: "auto",
      buffer,
      onComplete: vi.fn(),
    });

    // Poll until the panel paints rather than assuming a fixed delay.
    while (!document.querySelector(".shepherd-content") && Date.now() - started < 3000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const elapsed = Date.now() - started;

    expect(document.querySelector(".shepherd-content")).toBeTruthy();
    expect(droppedStepIds()).toHaveLength(5);
    // Sequential would be 5 × 120ms = 600ms floor. Concurrent is one timeout
    // plus overhead. The midpoint keeps this stable on a loaded CI box.
    expect(elapsed).toBeLessThan(TIMEOUT * 3);
  });
});

describe("findByTourId prefers a visible duplicate", () => {
  it("skips a zero-size copy and attaches to the rendered one", async () => {
    // The desktop sidebar is `hidden lg:block` and the mobile Sheet renders
    // the same data-tour-ids. Taking only the first match meant a collapsed
    // copy shadowed the real one and the step was dropped as "missing".
    const hidden = document.createElement("div");
    hidden.setAttribute("data-tour-id", "test.present");
    hidden.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect;
    document.body.appendChild(hidden);
    anchor("test.present"); // visible duplicate, added second

    const onComplete = vi.fn();
    runTour({
      config: {
        ...tourWithMissingTailStep,
        steps: [{ id: "only", target: "test.present", content: "one", waitForTarget: false }],
      },
      ctx,
      mode: "auto",
      buffer,
      onComplete,
    });
    await flush();

    // If the hidden copy had won, nothing would render and this would be
    // a no-show instead of a completable tour.
    expect(clickButton("Done")).toBe(true);
    await flush();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
