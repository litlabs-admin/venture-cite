// Spec 2 §4.2 Phase 2 step 2: robots.txt fetched once per run.
//
// Fail-open: missing or unfetchable robots.txt treats every URL as allowed.
// This matches what most production scrapers do; the alternative (fail-closed)
// would block the planner on a transient DNS hiccup.
//
// Parser is intentionally minimal: User-agent + Disallow lines, two-section
// matching (specific UA wins over '*'). Crawl-delay and Allow are ignored
// (we make at most 12 sequential requests; crawl-delay is moot).

type Fetcher = (url: string) => Promise<{ status: number; text: string; contentType: string }>;

interface ParsedRules {
  // Disallow prefixes for VentureCiteBot, falling back to '*' if absent.
  disallow: string[];
}

export interface RobotsCache {
  isAllowed(url: string): Promise<boolean>;
  raw(): string | null;
}

const OUR_USER_AGENT = "venturecitebot"; // lowercased

export function createRobotsCache(homepageUrl: string, fetcher: Fetcher): RobotsCache {
  let parsed: ParsedRules | null = null;
  let rawText: string | null = null;
  let loadPromise: Promise<void> | null = null;

  const homepage = new URL(homepageUrl);
  const robotsUrl = `${homepage.protocol}//${homepage.host}/robots.txt`;

  async function load(): Promise<void> {
    try {
      const res = await fetcher(robotsUrl);
      if (res.status >= 200 && res.status < 300 && res.text) {
        rawText = res.text;
        parsed = parseRobots(res.text);
      } else {
        parsed = { disallow: [] };
      }
    } catch {
      parsed = { disallow: [] };
      rawText = null;
    }
  }

  return {
    async isAllowed(url: string) {
      if (parsed === null && loadPromise === null) loadPromise = load();
      if (loadPromise) await loadPromise;
      if (!parsed) return true;
      let path: string;
      try {
        path = new URL(url).pathname;
      } catch {
        return true;
      }
      for (const rule of parsed.disallow) {
        if (rule === "") continue; // empty disallow == allow all
        if (path.startsWith(rule)) return false;
      }
      return true;
    },
    raw() {
      return rawText;
    },
  };
}

function parseRobots(txt: string): ParsedRules {
  const lines = txt.split(/\r?\n/);
  const sections: Array<{ agents: string[]; disallow: string[] }> = [];
  let current: { agents: string[]; disallow: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || current.disallow.length > 0) {
        current = { agents: [], disallow: [] };
        sections.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (key === "disallow" && current) {
      current.disallow.push(value);
    }
  }

  // Prefer a section that names us; otherwise fall back to '*'.
  const specific = sections.find((s) => s.agents.includes(OUR_USER_AGENT));
  if (specific) return { disallow: specific.disallow };
  const wildcard = sections.find((s) => s.agents.includes("*"));
  if (wildcard) return { disallow: wildcard.disallow };
  return { disallow: [] };
}
