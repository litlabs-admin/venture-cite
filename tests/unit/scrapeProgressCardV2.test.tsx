// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScrapeProgressCardV2 } from "../../client/src/components/fact-sheet/ScrapeProgressCardV2";

describe("ScrapeProgressCardV2", () => {
  it("renders three lanes: user-enrich, static-pages, search-LLM", () => {
    render(
      <ScrapeProgressCardV2
        sources={{
          userEnrich: { status: "done", facts: 3 },
          staticPages: { status: "in_progress", total: 8, done: 5, failed: 1, facts: 23 },
          searchLlm: { status: "pending", facts: 0 },
        }}
      />,
    );
    expect(screen.getByText(/Reading your description/i)).toBeInTheDocument();
    expect(screen.getByText(/Reading your website/i)).toBeInTheDocument();
    expect(screen.getByText(/Searching the web/i)).toBeInTheDocument();
  });

  it("shows total fact count", () => {
    render(
      <ScrapeProgressCardV2
        sources={{
          userEnrich: { status: "done", facts: 3 },
          staticPages: { status: "done", total: 8, done: 8, failed: 0, facts: 23 },
          searchLlm: { status: "done", facts: 5 },
        }}
      />,
    );
    expect(screen.getByText(/31/)).toBeInTheDocument();
  });

  it("shows N/M for static-pages in_progress", () => {
    render(
      <ScrapeProgressCardV2
        sources={{
          userEnrich: { status: "pending", facts: 0 },
          staticPages: { status: "in_progress", total: 8, done: 5, failed: 0, facts: 0 },
          searchLlm: { status: "pending", facts: 0 },
        }}
      />,
    );
    expect(screen.getByText(/5\/8/)).toBeInTheDocument();
  });
});
