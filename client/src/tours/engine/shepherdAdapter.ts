// client/src/tours/engine/shepherdAdapter.ts
//
// Wraps Shepherd.js. Single runTour entry point.
// Resolves data-tour-id targets via MutationObserver with timeout.
// Emits events to the supplied EventBuffer.

import Shepherd from "shepherd.js";
import type { TourConfig, TourContext, TourMode, TourStep } from "../types";
import { getCopy } from "./copyResolver";
import type { EventBuffer } from "./eventBuffer";

interface RunOptions {
  config: TourConfig;
  ctx: TourContext;
  mode: TourMode;
  buffer: EventBuffer;
  // Persistence callbacks. Fired at most once per run, and ONLY in "auto"
  // mode — a manual replay from the "?" button must never rewrite state.
  onComplete?: () => void;
  onSkipForever?: () => void;
  onSkip?: () => void;
  // Every step's target was missing, so nothing rendered. The tour must
  // NOT be persisted as completed/skipped (that would burn a one-step
  // nudge forever); the orchestrator clears its session guard so it can
  // re-fire when the user reaches the page whose anchor exists.
  onNoShow?: () => void;
  // Lifecycle, not persistence: fires exactly once when the run ends for
  // ANY reason — completed, skipped, suppressed, X/Esc, no-show, or a
  // programmatic cancel. The orchestrator clears its activeRef here.
  // Previously nothing cleared activeRef on an X/Esc dismiss, so one
  // dismissed tour blocked every other tour for the rest of the session.
  onEnd?: () => void;
}

const DEFAULT_TIMEOUT_MS = 3000;

function findByTourId(value: string): HTMLElement | null {
  // querySelectorAll, not querySelector: several targets are rendered twice
  // (the desktop sidebar is `hidden lg:block`, the mobile Sheet renders the
  // same nav.* ids). Taking only the first match meant a zero-size copy
  // shadowed the visible one and the step was treated as missing.
  const els = document.querySelectorAll<HTMLElement>(`[data-tour-id="${CSS.escape(value)}"]`);
  for (const el of els) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return el;
  }
  return null;
}

async function waitForTourTarget(target: string, timeoutMs: number): Promise<HTMLElement | null> {
  const immediate = findByTourId(target);
  if (immediate) return immediate;

  return new Promise((resolve) => {
    let done = false;
    const obs = new MutationObserver(() => {
      const el = findByTourId(target);
      if (el && !done) {
        done = true;
        obs.disconnect();
        resolve(el);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
    setTimeout(() => {
      if (!done) {
        done = true;
        obs.disconnect();
        resolve(null);
      }
    }, timeoutMs);
  });
}

export interface RunningTour {
  cancel(reason?: string): void;
}

export function runTour(opts: RunOptions): RunningTour {
  const { config, ctx, mode, buffer, onComplete, onSkipForever, onSkip, onNoShow, onEnd } = opts;
  // Only an auto-fired run owns the persisted state. A manual replay or an
  // admin preview must be able to end any way it likes without touching it.
  const persistable = mode === "auto";
  const baseEvent = (extras: { eventType: string } & Record<string, unknown>) => ({
    tourId: config.id,
    tourVersion: config.version,
    triggerType: mode,
    brandId: ctx.brandId,
    occurredAt: new Date().toISOString(),
    ...extras,
  });

  const tour = new Shepherd.Tour({
    useModalOverlay: true,
    defaultStepOptions: {
      cancelIcon: { enabled: true },
      classes: "tour-engine-step",
      scrollTo: { behavior: "smooth", block: "center" },
    },
  });

  let stepEnterAt = Date.now();
  let cancelled = false;
  // Steps that actually rendered (target found). If this stays 0 the
  // tour showed nothing — see onNoShow handling below.
  let builtCount = 0;
  // Programmatic cancels from the orchestrator (e.g. brand-switch)
  // should NOT mark the tour skipped — they're internal navigation,
  // not user intent. The orchestrator's RunningTour.cancel(reason)
  // sets this before tearing the tour down.
  let cancelReason: string | null = null;
  // Set by the "Done" button so the `complete` handler knows the run reached
  // its end through the UI. Shepherd also completes itself if next() is
  // called on the final step, so persistence hangs off the event, not off
  // the button — a completion must never be able to escape unpersisted.
  let completedStepId: string | null = null;
  // What the user pressed, read by the single `cancel` handler. Shepherd
  // funnels the Skip button, the "Don't show again" button, the X icon and
  // Esc all through one `cancel` event, so intent has to be recorded here
  // rather than inferred afterwards.
  let intent: "skip" | "suppress" | null = null;

  // EVERY terminal path goes through here, so a run can persist at most one
  // outcome and can never persist none. Three independent exit paths used to
  // each decide for themselves; that is how completions went missing.
  let settled = false;
  const settle = (persistAction?: () => void) => {
    if (settled) return;
    settled = true;
    persistAction?.();
    onEnd?.();
  };

  buffer.push(
    baseEvent({ eventType: mode === "manual" ? "tour_manual_replayed" : "tour_auto_fired" }),
  );

  // Resolve a step's anchor. Returns null when the target isn't on screen —
  // that step is dropped and does NOT count toward the rendered sequence.
  const resolveStep = async (step: TourStep, index: number) => {
    if (!step.target) return { step, attachTo: undefined };
    const wait = step.waitForTarget !== false;
    const el = wait
      ? await waitForTourTarget(step.target, step.waitTimeoutMs ?? DEFAULT_TIMEOUT_MS)
      : findByTourId(step.target);
    if (!el) {
      buffer.push(
        baseEvent({ eventType: "tour_step_target_missing", stepId: step.id, stepIndex: index }),
      );
      return null;
    }
    return { step, attachTo: { element: el, on: step.attachTo ?? "auto" } };
  };

  // `index` / `total` here are positions in the RENDERED sequence, not in
  // config.steps. They used to be config positions, which meant that when a
  // tail step's target was missing no rendered step ever satisfied
  // `index === config.steps.length - 1`: the final visible step showed "Next",
  // Shepherd completed itself, and `onComplete` — the only caller of
  // markCompleted — never ran. The tour then re-fired on every page load
  // forever, because nothing was ever persisted.
  const addStep = (
    step: TourStep,
    attachTo: { element: HTMLElement; on: TourStep["attachTo"] } | undefined,
    index: number,
    total: number,
  ) => {
    const isLast = index === total - 1;

    const buttons: Array<{
      text: string;
      secondary?: boolean;
      classes?: string;
      action?: () => void;
    }> = [];
    if (index > 0) {
      buttons.push({ text: "Back", secondary: true, action: () => tour.back() });
    }
    if (step.showSkip !== false && !isLast) {
      buttons.push({
        text: "Skip",
        secondary: true,
        action: () => {
          buffer.push(baseEvent({ eventType: "tour_skipped", stepId: step.id, stepIndex: index }));
          intent = "skip";
          tour.cancel();
        },
      });
    }
    if (step.showSkipForever !== false && mode === "auto") {
      buttons.push({
        text: "Don't show again",
        classes: "tour-skip-forever",
        action: () => {
          buffer.push(
            baseEvent({ eventType: "tour_suppressed", stepId: step.id, stepIndex: index }),
          );
          intent = "suppress";
          tour.cancel();
        },
      });
    }
    buttons.push({
      text: isLast ? "Done" : "Next",
      action: () => {
        const dwell = Date.now() - stepEnterAt;
        buffer.push(
          baseEvent({
            eventType: "tour_step_advanced",
            stepId: step.id,
            stepIndex: index,
            dwellMs: dwell,
          }),
        );
        if (isLast) {
          buffer.push(
            baseEvent({ eventType: "tour_completed", stepId: step.id, stepIndex: index }),
          );
          completedStepId = step.id;
          tour.complete();
        } else {
          tour.next();
        }
      },
    });

    tour.addStep({
      id: step.id,
      title: getCopy(config.id, step.id, step.title, ctx),
      text: getCopy(config.id, step.id, step.content, ctx),
      attachTo,
      buttons,
      when: {
        show: () => {
          stepEnterAt = Date.now();
          buffer.push(
            baseEvent({ eventType: "tour_step_viewed", stepId: step.id, stepIndex: index }),
          );
        },
      },
    });
  };

  (async () => {
    // Resolved CONCURRENTLY, not one after another. Each step waits up to
    // waitTimeoutMs (3s) for its anchor, and sequential waits made those
    // timeouts additive: the welcome tour on a sub-1024px viewport has six
    // anchors that can never appear, so the user sat looking at nothing for
    // ~18s before the first panel painted. Measured in production — the
    // tour_step_target_missing events land ~4s apart and the first
    // tour_step_viewed follows 27s after tour_auto_fired.
    //
    // There is no ordering dependency: every step observes the same DOM
    // independently, and Promise.all preserves input order, so the rendered
    // sequence is unchanged. Worst case is now one timeout, not N.
    const settledSteps = await Promise.all(config.steps.map((s, i) => resolveStep(s, i)));
    if (cancelled) return;
    const resolved = settledSteps.filter((r): r is NonNullable<typeof r> => r !== null);
    builtCount = resolved.length;
    resolved.forEach((r, i) => addStep(r.step, r.attachTo, i, resolved.length));
    if (builtCount === 0) {
      // Every step's target was missing — nothing rendered. Don't
      // persist completion/skip (that would consume a one-step nudge
      // permanently) and don't emit completed/abandoned. Hand back to
      // the orchestrator so the same tour can re-fire once the user is
      // on the page whose anchor exists. tour.start() is never called,
      // so Shepherd's "cancel" never fires for this run.
      settle();
      onNoShow?.();
      return;
    }
    requestAnimationFrame(() => {
      if (!cancelled) tour.start();
    });
  })();

  tour.on("complete", () => {
    if (cancelled || cancelReason) return;
    // Shepherd reaches "complete" from the Done button AND from next() on
    // the last step. Persisting here rather than inside the button covers
    // both; the emitted event is deduped against the button's own push.
    if (completedStepId === null) {
      buffer.push(baseEvent({ eventType: "tour_completed" }));
    }
    settle(persistable ? onComplete : undefined);
  });

  tour.on("cancel", () => {
    // The Skip button, the "Don't show again" button, the X icon and Esc
    // all arrive here. `intent` says which; null means X or Esc.
    if (cancelled || cancelReason) return; // programmatic — handled below

    if (intent === "suppress") {
      settle(persistable ? onSkipForever : undefined);
      return;
    }
    if (intent === "skip") {
      settle(persistable ? onSkip : undefined);
      return;
    }

    // X / Esc. This used to persist NOTHING, on the reasoning that an
    // accidental X shouldn't kill a tour forever. In production it was by
    // far the most common ending — 82 abandons against 6 completions on
    // the account that reported this — and every one of them meant the
    // tour returned on the next page load. Closing a tour IS a decision;
    // it is recorded as a skip, and the "?" in the page header replays
    // any tour on demand, so nothing is actually lost.
    buffer.push(baseEvent({ eventType: "tour_abandoned" }));
    settle(persistable ? onSkip : undefined);
  });

  return {
    cancel(reason?: string) {
      cancelled = true;
      cancelReason = reason ?? "programmatic";
      if (reason) {
        buffer.push(baseEvent({ eventType: "tour_abandoned", stepId: reason }));
      }
      try {
        tour.cancel();
      } catch {
        /* shepherd already torn down */
      }
      // Internal navigation (brand switch, route change), not user intent:
      // ends the run without persisting an outcome.
      settle();
    },
  };
}
