import { describe, it, expect } from "vitest";
import { normalizeHttps, evaluatePlanGuards } from "../../server/lib/factAgent/v2/planGuards";

describe("normalizeHttps", () => {
  it("upgrades http to https", () => {
    expect(normalizeHttps("http://example.com")).toBe("https://example.com/");
    expect(normalizeHttps("http://example.com/")).toBe("https://example.com/");
  });
  it("leaves https as-is", () => {
    expect(normalizeHttps("https://example.com/")).toBe("https://example.com/");
  });
  it("returns null for non-http(s)", () => {
    expect(normalizeHttps("file:///etc/passwd")).toBeNull();
    expect(normalizeHttps("javascript:alert(1)")).toBeNull();
    expect(normalizeHttps("not a url")).toBeNull();
  });
});

describe("evaluatePlanGuards", () => {
  const base = {
    brand: { id: "b1", factScrapeEnabled: true },
    inFlightRun: null as { id: string } | null,
    lastCompletedRunAt: null as Date | null,
    costCap: null as { factScrapeCents: number; monthlyCapCents: number } | null,
  };

  it("ok when nothing blocks", () => {
    const v = evaluatePlanGuards(base);
    expect(v.ok).toBe(true);
  });

  it("blocks when fact_scrape_enabled=false (409 paused)", () => {
    const v = evaluatePlanGuards({ ...base, brand: { id: "b1", factScrapeEnabled: false } });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.status).toBe(409);
      expect(v.code).toBe("paused");
    }
  });

  it("blocks when an in-flight run exists (409 already_running)", () => {
    const v = evaluatePlanGuards({ ...base, inFlightRun: { id: "run-existing" } });
    expect(v.ok).toBe(false);
    if (!v.ok && v.code === "already_running") {
      expect(v.status).toBe(409);
      expect(v.runId).toBe("run-existing");
    }
  });

  it("blocks when last completed run < 10 min ago (409 cooldown)", () => {
    const v = evaluatePlanGuards({
      ...base,
      lastCompletedRunAt: new Date(Date.now() - 5 * 60_000),
    });
    expect(v.ok).toBe(false);
    if (!v.ok && v.code === "cooldown") {
      expect(v.status).toBe(409);
      expect(typeof v.unlockAtMs).toBe("number");
    }
  });

  it("allows when last completed run > 10 min ago", () => {
    const v = evaluatePlanGuards({
      ...base,
      lastCompletedRunAt: new Date(Date.now() - 15 * 60_000),
    });
    expect(v.ok).toBe(true);
  });

  it("blocks when monthly cost cap reached (402)", () => {
    const v = evaluatePlanGuards({
      ...base,
      costCap: { factScrapeCents: 500, monthlyCapCents: 500 },
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.status).toBe(402);
      expect(v.code).toBe("cost_cap_reached");
    }
  });
});
