// Live "the agent is working" row: shown the instant a run starts and while
// the model is between tool calls, closing the blank 5-10s gap a reader
// used to see before anything appeared (loop.ts's status-before-model-call
// fix is the other half of this - see that file's comment).
//
// The orb is `thinking-orbs` (MIT, zero runtime deps, libraries.dev/orbs) at
// its 20px inline-text preset. `theme="auto"` watches this app's
// `data-theme` attribute on <html> (client/src/lib/theme.ts sets it
// alongside the `.dark` class specifically so this resolves correctly - a
// reader on a light-themed page with the OS set to dark used to get
// dark-mode ink, invisible against the light background, because nothing
// told the orb which theme this page was actually in), so no further wiring
// is needed here. `paused` follows prefers-reduced-motion so the animation
// never fights a reader who has asked the OS to turn it off.
import { useEffect, useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

// A live "how long has this been running" readout - ticks once a second
// from the moment the row mounts, which is also the moment the run started
// (AskWorkspace seeds the placeholder synchronously on Send).
function useElapsedSeconds(): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return elapsed;
}

// The server's status verbs (loop.ts, server/routes/ask.ts) mapped to one
// of the orb's nine tuned states - kept here, next to the one place that
// reads it, rather than threading a separate "phase" prop through every
// caller. Every investigating verb (Reading the brand, Thinking through the
// question, Checking data, Reviewing what a tool found) maps to
// "searching" - the tuned globe visual ("a scan meridian sweeps a dotted
// globe") - and stays the default for any future verb this map doesn't
// name yet. Only actually writing the final answer gets its own distinct
// state; that split used to put "Thinking" on the sparse "working" particle
// state, and any unmapped verb (like "Reading", added after this map was
// first written) fell back to that same easy-to-miss state instead of the
// globe.
const ORB_STATE_BY_VERB: Record<string, OrbState> = {
  Writing: "composing",
};

function orbStateForVerb(verb: string): OrbState {
  return ORB_STATE_BY_VERB[verb] ?? "searching";
}

export function AskThinking({ verb, object }: { verb: string; object: string }) {
  const reducedMotion = usePrefersReducedMotion();
  const elapsed = useElapsedSeconds();

  return (
    <div className="mb-3 flex items-center gap-2 text-caption text-vc-secondary">
      <ThinkingOrb state={orbStateForVerb(verb)} size={20} theme="auto" paused={reducedMotion} />
      <span className="ask-shimmer-text font-medium">
        {verb} {object}
      </span>
      {elapsed > 0 && (
        <span className="ml-auto shrink-0 font-mono text-data tabular-nums text-vc-tertiary">
          {elapsed}s
        </span>
      )}
    </div>
  );
}
