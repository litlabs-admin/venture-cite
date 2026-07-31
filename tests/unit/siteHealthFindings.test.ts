import { describe, it, expect } from "vitest";
import { computeSiteHealthFindings } from "@shared/siteHealthFindings";

const baseHealth = {
  crawl: { pagesCrawled: 10, pagesFailed: 0 },
  discovery: { robotsTxt: true, sitemapXml: true, llmsTxt: true, mcpJson: true, securityTxt: true },
  crawlers: { total: 10, allowed: 10, blocked: 0, blockedCrawlers: [] as string[] },
};

describe("computeSiteHealthFindings - no crawl", () => {
  it("returns [] when pagesCrawled is null", () => {
    expect(
      computeSiteHealthFindings(
        { ...baseHealth, crawl: { pagesCrawled: null, pagesFailed: null } },
        [],
      ),
    ).toEqual([]);
  });

  it("returns [] when health is null", () => {
    expect(computeSiteHealthFindings(null, [])).toEqual([]);
  });
});

describe("computeSiteHealthFindings - discoverability", () => {
  it("flags missing llms.txt at 10 pts", () => {
    const findings = computeSiteHealthFindings(
      { ...baseHealth, discovery: { ...baseHealth.discovery, llmsTxt: false } },
      [],
    );
    const f = findings.find((x) => x.id === "missing-llms-txt");
    expect(f).toBeTruthy();
    expect(f!.points).toBe(10);
    expect(f!.category).toBe("DISCOVERABILITY");
  });

  it("flags missing sitemap.xml at 15 pts", () => {
    const findings = computeSiteHealthFindings(
      { ...baseHealth, discovery: { ...baseHealth.discovery, sitemapXml: false } },
      [],
    );
    const f = findings.find((x) => x.id === "missing-sitemap-xml");
    expect(f!.points).toBe(15);
  });

  it("flags missing robots.txt at 10 pts", () => {
    const findings = computeSiteHealthFindings(
      { ...baseHealth, discovery: { ...baseHealth.discovery, robotsTxt: false } },
      [],
    );
    const f = findings.find((x) => x.id === "missing-robots-txt");
    expect(f!.points).toBe(10);
  });
});

describe("computeSiteHealthFindings - crawler access", () => {
  it("scales points by blocked/total of the 35-pt weight and lists blocked crawler names", () => {
    const findings = computeSiteHealthFindings(
      {
        ...baseHealth,
        crawlers: { total: 10, allowed: 8, blocked: 2, blockedCrawlers: ["GPTBot", "ClaudeBot"] },
      },
      [],
    );
    const f = findings.find((x) => x.id === "blocked-ai-crawlers")!;
    expect(f.points).toBe(Math.round((2 / 10) * 35));
    expect(f.description).toContain("GPTBot");
    expect(f.description).toContain("ClaudeBot");
  });

  it("does not add a finding when nothing is blocked", () => {
    const findings = computeSiteHealthFindings(baseHealth, []);
    expect(findings.find((x) => x.id === "blocked-ai-crawlers")).toBeUndefined();
  });
});

describe("computeSiteHealthFindings - content quality", () => {
  const pages = [
    { url: "https://ex.com/a", statusCode: 500, errorKind: null, factCount: 0 },
    { url: "https://ex.com/b", statusCode: 404, errorKind: null, factCount: 0 },
    { url: "https://ex.com/c", statusCode: 200, errorKind: null, factCount: 0 },
    { url: "https://ex.com/d", statusCode: 200, errorKind: null, factCount: 5 },
  ];

  it("flags 4xx/5xx pages scaled by the 30-pt crawl-success weight", () => {
    const findings = computeSiteHealthFindings(baseHealth, pages);
    const f = findings.find((x) => x.id === "failed-pages")!;
    expect(f.points).toBe(Math.round((2 / 4) * 30));
    expect(f.affectedUrls).toEqual(["https://ex.com/a", "https://ex.com/b"]);
  });

  it("flags 2xx pages with zero facts as thin content", () => {
    const findings = computeSiteHealthFindings(baseHealth, pages);
    const f = findings.find((x) => x.id === "thin-content")!;
    expect(f.points).toBe(Math.round((1 / 4) * 30));
    expect(f.affectedUrls).toEqual(["https://ex.com/c"]);
  });

  it("flags a fetch-failed page (null statusCode, errorKind set)", () => {
    const findings = computeSiteHealthFindings(baseHealth, [
      { url: "https://ex.com/e", statusCode: null, errorKind: "timeout", factCount: 0 },
    ]);
    const f = findings.find((x) => x.id === "failed-pages")!;
    expect(f.affectedUrls).toEqual(["https://ex.com/e"]);
  });
});

describe("computeSiteHealthFindings - content structure (advisory)", () => {
  it("flags missing mcp.json / security.txt at 0 pts, advisory:true", () => {
    const findings = computeSiteHealthFindings(
      { ...baseHealth, discovery: { ...baseHealth.discovery, mcpJson: false, securityTxt: false } },
      [],
    );
    const mcp = findings.find((x) => x.id === "missing-mcp-json")!;
    const sec = findings.find((x) => x.id === "missing-security-txt")!;
    expect(mcp.points).toBe(0);
    expect(mcp.advisory).toBe(true);
    expect(sec.points).toBe(0);
    expect(sec.advisory).toBe(true);
    expect(mcp.category).toBe("CONTENT STRUCTURE");
  });
});

describe("computeSiteHealthFindings - unknown (unmeasured) discovery", () => {
  it("does not flag a 'missing' finding when a file is null (unknown), only when confirmed false", () => {
    const findings = computeSiteHealthFindings(
      { ...baseHealth, discovery: { ...baseHealth.discovery, llmsTxt: null } },
      [],
    );
    expect(findings.find((x) => x.id === "missing-llms-txt")).toBeUndefined();
  });
});

describe("computeSiteHealthFindings - sort order", () => {
  it("sorts findings descending by points", () => {
    const findings = computeSiteHealthFindings(
      {
        crawl: { pagesCrawled: 4, pagesFailed: 0 },
        discovery: {
          robotsTxt: false,
          sitemapXml: false,
          llmsTxt: false,
          mcpJson: false,
          securityTxt: false,
        },
        crawlers: { total: 10, allowed: 5, blocked: 5, blockedCrawlers: ["GPTBot"] },
      },
      [
        { url: "https://ex.com/a", statusCode: 500, errorKind: null, factCount: 0 },
        { url: "https://ex.com/b", statusCode: 200, errorKind: null, factCount: 0 },
      ],
    );
    const points = findings.map((f) => f.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });
});
