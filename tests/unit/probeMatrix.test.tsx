// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProbeMatrix, type Probe, type ProbeRun } from "@/components/perception/ProbeMatrix";

// The matrix has four cell states that must never collapse into each other:
// scored, no-information, failed, pending. Conflating any two of them is the
// exact dishonesty this pipeline exists to avoid - most importantly, a "no
// information" cell must never read as a bad score.

function probe(over: Partial<Probe>): Probe {
  return {
    platform: "ChatGPT",
    axis: "trust",
    question: "How trustworthy is Venture PR?",
    status: "scored",
    answer: "Clients rate them 4.9/5 on Clutch.",
    sources: [{ url: "https://clutch.co/profile/venturepr-0" }],
    score: 78,
    noInformation: false,
    note: "The answer cites strong verified review ratings.",
    errorMessage: null,
    ...over,
  };
}

function run(probes: Probe[], over: Partial<ProbeRun> = {}): ProbeRun {
  return {
    runId: "r1",
    status: "succeeded",
    probesDone: probes.length,
    probesTotal: probes.length,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    errorMessage: null,
    probes,
    ...over,
  };
}

const noop = () => {};

describe("ProbeMatrix", () => {
  it("renders a scored cell as its number", () => {
    render(
      <ProbeMatrix run={run([probe({ score: 78 })])} onRun={noop} running={false} error={null} />,
    );
    // Twice, legitimately: the cell itself, and the Average row - with a
    // single engine the cross-engine average IS that engine's score.
    expect(screen.getAllByText("78.0")).toHaveLength(2);
  });

  it("labels a no-information cell as unscored, never as a number", () => {
    render(
      <ProbeMatrix
        run={run([probe({ score: null, noInformation: true })])}
        onRun={noop}
        running={false}
        error={null}
      />,
    );
    expect(screen.getByText("No info")).toBeTruthy();
    expect(screen.getByText("not scored")).toBeTruthy();
    // The bug this guards: a null score falling through to `.toFixed(1)`.
    expect(screen.queryByText("0.0")).toBeNull();
  });

  it("labels a failed cell as failed rather than as an absence of reputation", () => {
    render(
      <ProbeMatrix
        run={run([probe({ status: "failed", score: null, errorMessage: "timeout" })])}
        onRun={noop}
        running={false}
        error={null}
      />,
    );
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.queryByText("No info")).toBeNull();
  });

  it("averages across engines excluding non-answers", () => {
    render(
      <ProbeMatrix
        run={run([
          probe({ platform: "ChatGPT", score: 80 }),
          probe({ platform: "Gemini", score: 90 }),
          probe({ platform: "Grok", score: null, noInformation: true }),
        ])}
        onRun={noop}
        running={false}
        error={null}
      />,
    );
    // 80 and 90 average to 85.0. Counting Grok's silence as a zero would give
    // 56.7 - a fabricated bad result out of an absence of coverage.
    expect(screen.getByText("85.0")).toBeTruthy();
    expect(screen.queryByText("56.7")).toBeNull();
  });

  it("opens the question, note and sources behind a cell when it is clicked", () => {
    render(<ProbeMatrix run={run([probe({})])} onRun={noop} running={false} error={null} />);
    // The Average row also reads 78.0 but is not interactive - click the cell.
    const cell = screen.getAllByRole("button").find((b) => b.textContent === "78.0")!;
    fireEvent.click(cell);
    expect(screen.getByText("How trustworthy is Venture PR?")).toBeTruthy();
    expect(screen.getByText("The answer cites strong verified review ratings.")).toBeTruthy();
    expect(screen.getByText("https://clutch.co/profile/venturepr-0")).toBeTruthy();
  });

  it("shows a first-run empty state rather than an empty grid", () => {
    render(<ProbeMatrix run={null} onRun={noop} running={false} error={null} />);
    expect(screen.getByText(/No engine has been asked about this brand yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ask the engines/ })).toBeTruthy();
  });

  it("reports progress and blocks a second run while one is in flight", () => {
    const onRun = vi.fn();
    render(
      <ProbeMatrix
        run={run([probe({})], { status: "running", probesDone: 12, probesTotal: 30 })}
        onRun={onRun}
        running={false}
        error={null}
      />,
    );
    const btn = screen.getByRole("button", { name: /Asking engines/ });
    expect(btn.textContent).toContain("12/30");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    expect(onRun).not.toHaveBeenCalled();
  });

  it("says a partial run is partial instead of presenting it as complete", () => {
    render(
      <ProbeMatrix
        run={run([probe({})], { status: "partial" })}
        onRun={noop}
        running={false}
        error={null}
      />,
    );
    expect(screen.getByText(/Some probes failed on this run/)).toBeTruthy();
  });
});
