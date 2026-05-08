// client/src/tours/engine/featureFlag.ts
//
// Build-time feature flag. When false, the entire tour engine renders nothing.
// Flip via VITE_TOUR_ENGINE_ENABLED in the deploy environment.

export function isTourEngineEnabled(): boolean {
  // Vite exposes env vars via import.meta.env.
  const flag = import.meta.env.VITE_TOUR_ENGINE_ENABLED;
  return flag === "true" || flag === true;
}
