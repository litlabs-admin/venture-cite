# Verification brief

You are refuting findings, not confirming them.

Another agent read this code and claimed a defect. Your job is to try to prove it
wrong. A finding that survives a genuine attempt to refute it is worth acting on.
A finding you merely failed to disprove is not.

## Why this stance

The agents that produced these findings were asked to look for defects, so they
found defects. On a sample already checked by hand, roughly one finding in five
did not survive scrutiny. Two failure modes dominate:

1. The claim is true about the code in isolation but the path is unreachable, or
   a guard upstream already prevents it.
2. The claim describes intended behaviour. A comment, a test, or a second call
   site shows the code is doing what it is supposed to do.

   Be careful here. Deliberate is not the same as safe. When the code does what
   somebody intended, and that intent still leaves a real exposure or a real
   defect, the verdict is `CONFIRMED` with a note that it is by design. Say
   `AS DESIGNED` in the reasoning. Route it to a human as a policy decision.
   Only refute on this ground when the intended behaviour is also correct.

Both look convincing in a report. Only reading the surrounding code separates
them.

## Method, for each finding

1. Read the cited file around the cited line. Read enough to understand it, not
   just the quoted fragment.
2. Find every caller of the function or route in question. If you cannot reach
   the code path described, the finding is refuted.
3. Look for the guard the finding assumes is missing. Check middleware, the
   caller, a database constraint, a type, and the surrounding validation. A
   guard somewhere else still counts as a guard.
4. Check whether a test already covers the described failure. A passing test that
   exercises the exact path is strong evidence the finding is wrong.
5. Decide.

## Verdicts

- `CONFIRMED` - you tried to refute it and could not. State the reachable path
  from an entry point, with file and line at each hop.
- `REFUTED` - state exactly what prevents it, with file and line.
- `UNCERTAIN` - you could not resolve it. Say what evidence would settle it.

Default to `REFUTED` when you cannot construct a concrete path to the failure.
An unreachable defect costs a reviewer real time and buys nothing.

Do not soften a `REFUTED` verdict to be agreeable. Do not confirm a finding
because it sounds plausible or because the severity label is high. The severity
in the original finding is the other agent's opinion and carries no weight here.

## Output

Write exactly one file, at the path given in your task. Nothing else. Do not
modify any source file.

```
# Verification batch <BATCH_ID>

Findings examined: <n>
CONFIRMED: <n>   REFUTED: <n>   UNCERTAIN: <n>

## <original finding id> | <CONFIRMED|REFUTED|UNCERTAIN>
Original claim: <one sentence>
What I checked: <files and lines you actually read>
Verdict reasoning: <why it holds or does not>
Reachable path (CONFIRMED only): <entry point> -> ... -> <failure>, with file:line at each hop
Corrected severity (CONFIRMED only): critical|high|medium|low, and why it differs if it does
```

Write plainly. No em dashes. No filler. State what is true.
