// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { PageHeaderHelp } from "../../client/src/components/PageHeaderHelp";

vi.mock("../../client/src/tours/engine/featureFlag", () => ({
  isTourEngineEnabled: () => true,
}));

vi.mock("../../client/src/tours/registry", () => ({
  getTour: (id: string) => (id === "dashboard" ? { id, version: 1, steps: [] } : undefined),
}));

describe("PageHeaderHelp", () => {
  it("renders '?' icon when tour exists", () => {
    const { getByLabelText } = render(<PageHeaderHelp tourId="dashboard" pageLabel="Dashboard" />);
    expect(getByLabelText(/replay dashboard tour/i)).toBeTruthy();
  });

  it("falls back to chatbot label when tour missing", () => {
    const { getByLabelText } = render(<PageHeaderHelp tourId="nonexistent" pageLabel="Foo" />);
    expect(getByLabelText(/ai tutor/i)).toBeTruthy();
  });

  it("invokes window.__replayTour on click for existing tour", () => {
    const replay = vi.fn();
    (window as unknown as Record<string, unknown>).__replayTour = replay;
    const { getByLabelText } = render(<PageHeaderHelp tourId="dashboard" pageLabel="Dashboard" />);
    fireEvent.click(getByLabelText(/replay/i));
    expect(replay).toHaveBeenCalledWith("dashboard");
  });

  it("dispatches openChatbotPrompt when no tour", () => {
    const handler = vi.fn();
    window.addEventListener("venturecite:open-chatbot-prompt", handler);
    const { getByLabelText } = render(<PageHeaderHelp tourId="nonexistent" pageLabel="Foo" />);
    fireEvent.click(getByLabelText(/tutor/i));
    expect(handler).toHaveBeenCalled();
  });
});
