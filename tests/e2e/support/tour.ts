import type { Page } from "@playwright/test";

/**
 * Closes the product tour if it is currently on screen.
 *
 * The tour engine (client/src/tours/engine/) auto-fires per browser session
 * and renders a Shepherd modal whose full-viewport overlay
 * (`.shepherd-modal-overlay-container`) swallows pointer events. Any spec that
 * clicks something on a page the tour targets will time out with
 * "<path> from <svg class='shepherd-modal-overlay-container'> subtree
 * intercepts pointer events" - which reads like a broken selector but is not.
 *
 * This is a cross-test ordering hazard, not a per-spec bug: each Playwright
 * test gets a fresh context, so the orchestrator's per-session guard
 * (firedThisSessionRef) does not carry over, and auto-fire eligibility is
 * server state shared by every test on the same account.
 *
 * Escape is a deliberate SOFT dismiss. Per shepherdAdapter.ts, Escape and the
 * X icon do NOT persist a skip - only the explicit "Skip"/"Don't show again"
 * buttons do. So this unblocks the current page without mutating shared
 * account state and silently narrowing what tours.spec.ts can still observe.
 */
export async function dismissTourIfPresent(page: Page, appearWindowMs = 6_000): Promise<void> {
  // The overlay element exists even when idle, so `.shepherd-modal-is-visible`
  // is what actually distinguishes "a tour is running".
  const visible = page.locator(".shepherd-modal-overlay-container.shepherd-modal-is-visible");

  // Wait for it to APPEAR rather than sampling once. The orchestrator fires
  // after its brand/tour-state/counts queries resolve, so a check taken
  // immediately after page.goto() reliably runs too early and sees nothing -
  // the tour then opens a moment later, mid-click. That is exactly how this
  // helper failed on its first version.
  try {
    await visible.first().waitFor({ state: "visible", timeout: appearWindowMs });
  } catch {
    // No tour within the window. Eligibility is server state shared across
    // tests, so "not this time" is a normal outcome, not a failure.
    return;
  }

  // Escape is a deliberate SOFT dismiss (see the doc comment above): it does
  // not persist a skip, so this cannot narrow what tours.spec.ts observes.
  // Loop because a step can re-render or advance between attempts - the
  // observed failure showed the overlay's clip path changing between retries.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press("Escape");
    try {
      await visible.first().waitFor({ state: "hidden", timeout: 3_000 });
      return;
    } catch {
      // Still up - try again.
    }
  }

  // Deliberately not throwing: let the caller's own click or assertion produce
  // the failure, with its real selector and message. Failing here would report
  // a helper timeout and hide which interaction was actually blocked.
}
