// @vitest-environment happy-dom
//
// B9 UI/UX audit: client/src/pages/prompt-diagnose.tsx rendered the "Rivals
// named" stat as `data.rivals.length || null`. `||` substitutes on ANY
// falsy value, so a real, measured "zero rivals named" (`0 || null` ===
// `null`) rendered the same NoValue "–" dash as "not measured" - directly
// contradicting the "Who wins this question instead (0)" heading a few
// lines below it, which shows the correct 0. Fixed to `??`, which only
// substitutes on null/undefined.
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ promptId: "prompt-1" }),
  Link: ({ children, ...props }: { children?: ReactNode }) => <a {...props}>{children}</a>,
}));

vi.mock("@/hooks/use-brand-selection", () => ({
  useBrandSelection: () => ({ selectedBrandId: "brand-1" }),
}));

const apiRequestMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queryClient", () => ({
  apiRequest: apiRequestMock,
}));

import PromptDiagnosePage from "@/pages/prompt-diagnose";

const DIAGNOSIS = {
  prompt: { id: "prompt-1", text: "Best CRM for startups", category: null, funnelStage: null },
  standing: {
    score: 40,
    rank: 3,
    modelsCited: 2,
    modelsChecked: 4,
    modelsTotal: 4,
    responsesAnalysed: 4,
    lastCheckedAt: null,
  },
  rivals: [],
  sources: [],
  ownDomain: "acme.com",
  verdict: "You are cited but ranked behind two rivals.",
  fixes: [],
  narrativeError: null,
};

describe("PromptDiagnosePage - rivals count is a real zero, not 'not measured'", () => {
  it("shows 0 (not a dash) when the brand genuinely has zero named rivals", async () => {
    apiRequestMock.mockResolvedValue({
      json: async () => ({ success: true, data: DIAGNOSIS }),
    });

    render(<PromptDiagnosePage />);

    await waitFor(() => {
      expect(screen.getByText("Who wins this question instead (0)")).toBeTruthy();
    });

    const rivalsLabel = screen.getByText("Rivals named");
    const statValue = rivalsLabel.parentElement?.querySelector(".font-mono");
    expect(statValue?.textContent).toBe("0");
    expect(statValue?.textContent).not.toBe("–");
  });
});
