// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ManualPasteCard } from "../../client/src/components/fact-sheet/ManualPasteCard";

describe("ManualPasteCard", () => {
  it("renders title, textarea, submit, and manual-fill button", () => {
    render(<ManualPasteCard runId="run-1" onSubmit={vi.fn()} onManualFill={vi.fn()} />);
    expect(screen.getByText(/couldn't read your site automatically/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Submit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fill fields manually/i })).toBeInTheDocument();
  });

  it("invokes onSubmit with the textarea content when Submit is clicked", () => {
    const onSubmit = vi.fn();
    render(<ManualPasteCard runId="run-1" onSubmit={onSubmit} onManualFill={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "We build AI." } });
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));
    expect(onSubmit).toHaveBeenCalledWith("We build AI.");
  });

  it("disables submit when textarea is empty", () => {
    render(<ManualPasteCard runId="run-1" onSubmit={vi.fn()} onManualFill={vi.fn()} />);
    const submitBtn = screen.getByRole("button", { name: /Submit/i });
    expect(submitBtn).toBeDisabled();
  });

  it("disables submit when textarea exceeds 50_000 chars", () => {
    render(<ManualPasteCard runId="run-1" onSubmit={vi.fn()} onManualFill={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a".repeat(50_001) } });
    expect(screen.getByRole("button", { name: /Submit/i })).toBeDisabled();
  });
});
