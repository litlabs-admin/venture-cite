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
  onComplete?: () => void;
  onSkipForever?: () => void;
  onSkip?: () => void;
}

const DEFAULT_TIMEOUT_MS = 3000;

function findByTourId(value: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[data-tour-id="${CSS.escape(value)}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return el;
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
  const { config, ctx, mode, buffer, onComplete, onSkipForever, onSkip } = opts;
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

  buffer.push(
    baseEvent({ eventType: mode === "manual" ? "tour_manual_replayed" : "tour_auto_fired" }),
  );

  const buildStep = async (step: TourStep, index: number) => {
    let attachTo: { element: HTMLElement; on: TourStep["attachTo"] } | undefined;
    if (step.target) {
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
      attachTo = { element: el, on: step.attachTo ?? "auto" };
    }

    const buttons: Array<{
      text: string;
      secondary?: boolean;
      classes?: string;
      action?: () => void;
    }> = [];
    if (index > 0) {
      buttons.push({ text: "Back", secondary: true, action: () => tour.back() });
    }
    if (step.showSkip !== false && index < config.steps.length - 1) {
      buttons.push({
        text: "Skip",
        secondary: true,
        action: () => {
          buffer.push(baseEvent({ eventType: "tour_skipped", stepId: step.id, stepIndex: index }));
          onSkip?.();
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
          onSkipForever?.();
          tour.cancel();
        },
      });
    }
    buttons.push({
      text: index === config.steps.length - 1 ? "Done" : "Next",
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
        if (index === config.steps.length - 1) {
          buffer.push(
            baseEvent({ eventType: "tour_completed", stepId: step.id, stepIndex: index }),
          );
          if (mode === "auto") onComplete?.();
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
    return true;
  };

  (async () => {
    for (let i = 0; i < config.steps.length; i++) {
      if (cancelled) return;
      await buildStep(config.steps[i], i);
    }
    if (!cancelled) {
      requestAnimationFrame(() => {
        if (!cancelled) tour.start();
      });
    }
  })();

  tour.on("cancel", () => {
    if (!cancelled) {
      buffer.push(baseEvent({ eventType: "tour_abandoned" }));
    }
  });

  return {
    cancel(reason?: string) {
      cancelled = true;
      if (reason) {
        buffer.push(baseEvent({ eventType: "tour_abandoned", stepId: reason }));
      }
      try {
        tour.cancel();
      } catch {
        /* shepherd already torn down */
      }
    },
  };
}
