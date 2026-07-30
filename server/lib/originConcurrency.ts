// Per-origin politeness guard.
//
// Site Health fires five discovery probes + a robots.txt fetch + a platform
// detection fetch + a sitemap fetch (recursively, for sitemapindex children)
// — all against the SAME customer origin, and all roughly concurrently
// (server/routes/dashboard.ts's computeSiteHealth Promise.all). Apple.com got
// hammered with this many parallel requests during testing; a customer's own
// site deserves the same restraint we'd want applied to ours.
//
// Bounded concurrency PER ORIGIN, no queue-of-known-jobs (the pattern in
// runFullScrape.ts ~line 452 assumes a fixed job list processed upfront;
// here calls arrive from independent call sites — fetchRobots, fetchDiscovery,
// detectPlatform, getSitemapUrlCount — so a semaphore that calls acquire/
// release around each fetch is the shape that actually fits). No p-limit
// dependency: this is the same "bounded work, no unbounded Map" spirit as
// the site-health cache above, just guarding concurrency instead of memory.
const MAX_CONCURRENT_PER_ORIGIN = 2;

type Waiter = () => void;

type OriginState = {
  active: number;
  queue: Waiter[];
};

const originStates = new Map<string, OriginState>();

// BOUNDED. Entries live only while requests are in flight for that origin;
// once active===0 and the queue drains we delete the entry rather than
// leaving a permanent per-brand-domain map entry.
function getState(origin: string): OriginState {
  let state = originStates.get(origin);
  if (!state) {
    state = { active: 0, queue: [] };
    originStates.set(origin, state);
  }
  return state;
}

function release(origin: string): void {
  const state = originStates.get(origin);
  if (!state) return;
  state.active -= 1;
  const next = state.queue.shift();
  if (next) {
    state.active += 1;
    next();
  } else if (state.active <= 0 && state.queue.length === 0) {
    originStates.delete(origin);
  }
}

/** Run `fn` under a per-origin concurrency cap of 2. Callers derive `origin`
 *  from the URL they're about to fetch (protocol + host), so requests to
 *  different origins never contend with each other. */
export async function withOriginLimit<T>(origin: string, fn: () => Promise<T>): Promise<T> {
  const state = getState(origin);
  if (state.active < MAX_CONCURRENT_PER_ORIGIN) {
    state.active += 1;
  } else {
    await new Promise<void>((resolve) => state.queue.push(resolve));
  }
  try {
    return await fn();
  } finally {
    release(origin);
  }
}
