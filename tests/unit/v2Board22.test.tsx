// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { board22Fixture } from "@/v2/screens/b22-geo-assistant/fixture";
import { Board22Screen } from "@/v2/screens/b22-geo-assistant/Screen";
import {
  mapGeoAssistantContext,
  type GeoAssistantContextResponse,
} from "@/v2/screens/b22-geo-assistant/data";

const chatState = vi.hoisted(() => ({
  threads: [
    { id: "t-1", title: "Improve startup PR visibility", updatedAt: "2026-09-08" },
  ] as Array<{ id: string; title: string; updatedAt: string }>,
  threadsLoading: false,
  activeThreadId: null as string | null,
  selectThread: vi.fn(),
  newChat: vi.fn(),
  messages: [] as Array<{ role: "user" | "assistant"; content: string }>,
  isStreaming: false,
  error: null as string | null,
  budgetExceeded: false,
  send: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@/v2/screens/b22-geo-assistant/chat", () => ({
  useBoard22Chat: () => chatState,
}));

describe("Board 22 GEO assistant", () => {
  it("renders the approved chat layout, right rail, and evidence rules", () => {
    render(<Board22Screen data={board22Fixture} />);

    expect(
      screen.getByRole("heading", { name: "Ask about your verified visibility data" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Why is VenturePR missing from startup PR answers?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Observations")).toBeInTheDocument();
    expect(screen.getByText("Hypotheses")).toBeInTheDocument();
    expect(screen.getAllByText("Review source evidence").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Create an experiment").length).toBeGreaterThan(0);

    expect(screen.getByText("VenturePR")).toBeInTheDocument();
    expect(screen.getByText("venturepr.com")).toBeInTheDocument();
    expect(screen.getByText("40 queries")).toBeInTheDocument();
    expect(screen.getByText("1248 sources")).toBeInTheDocument();
    expect(screen.getByText("8 brands")).toBeInTheDocument();

    expect(screen.getByText("Live model data")).toBeInTheDocument();
    expect(screen.getByText("Direct API access not available")).toBeInTheDocument();
    expect(
      screen.getByText("Answers use only your verified VentureCite data"),
    ).toBeInTheDocument();

    expect(screen.getByText("Improve startup PR visibility")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      expect.stringContaining("/v2/settings"),
    );
  });

  it("sends a suggested question through the live chat hook", () => {
    render(<Board22Screen data={board22Fixture} />);

    fireEvent.click(screen.getByText("How can I improve my visibility?"));

    expect(chatState.send).toHaveBeenCalledWith("How can I improve my visibility?");
  });

  it("shows the honest not-measured state for a value the API did not return", () => {
    const data = {
      ...board22Fixture,
      dataAvailable: {
        ...board22Fixture.dataAvailable,
        competitors: { kind: "not-measured" as const, reason: "No competitor is tracked yet." },
      },
    };
    render(<Board22Screen data={data} />);

    expect(screen.getAllByText("Not measured").length).toBeGreaterThan(0);
  });
});

describe("Board 22 live adapter", () => {
  const raw: GeoAssistantContextResponse = {
    brand: { name: "VenturePR", domain: "venturepr.com" },
    dataAvailable: {
      trackedQuestions: 40,
      window: { start: "2026-08-26", end: "2026-09-08" },
      citedSourceCount: 1248,
      competitorCount: 8,
    },
    savedConversations: [{ id: "conv-1", title: "Improve startup PR visibility", updatedAt: "2026-09-08" }],
  };

  it("maps a fully measured context into the screen contract", () => {
    const data = mapGeoAssistantContext(raw, "brand-1");

    expect(data.context).toEqual({ brandId: "brand-1", mode: "guided" });
    expect(data.brand).toEqual({ name: "VenturePR", domain: { kind: "measured", value: "venturepr.com" } });
    expect(data.dataAvailable.trackedQuestions).toEqual({ kind: "measured", value: 40 });
    expect(data.dataAvailable.visibilityWindow).toEqual({
      kind: "measured",
      value: "Aug 26, 2026 - Sep 8, 2026",
    });
    expect(data.dataAvailable.citedSources).toEqual({ kind: "measured", value: 1248 });
    expect(data.dataAvailable.competitors).toEqual({ kind: "measured", value: 8 });
    expect(data.conversation.messages).toEqual([]);
    expect(data.savedConversations).toEqual(raw.savedConversations);
  });

  it("reports honest not-measured reasons instead of fake zeros", () => {
    const empty: GeoAssistantContextResponse = {
      brand: { name: "New Brand", domain: null },
      dataAvailable: { trackedQuestions: 0, window: null, citedSourceCount: 0, competitorCount: 0 },
      savedConversations: [],
    };
    const data = mapGeoAssistantContext(empty, "brand-2");

    expect(data.brand.domain).toEqual({
      kind: "not-measured",
      reason: "No website is set for this brand.",
    });
    expect(data.dataAvailable.trackedQuestions.kind).toBe("not-measured");
    expect(data.dataAvailable.visibilityWindow.kind).toBe("not-measured");
    expect(data.dataAvailable.citedSources.kind).toBe("not-measured");
    expect(data.dataAvailable.competitors.kind).toBe("not-measured");
  });
});
