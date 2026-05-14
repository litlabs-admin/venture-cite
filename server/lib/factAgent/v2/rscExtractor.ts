// Extract hydration / RSC payloads from a static HTML response.
// Order: try RSC first (modern Next App Router default), then Pages Router
// __NEXT_DATA__, then Nuxt, then SvelteKit, then window.* state, then
// generic <script type="application/json"> (catch-all).
//
// Returns the concatenated text payload + flags so the caller knows which
// signals were present (drives the hollow-shell check downstream).

export interface HydrationResult {
  /** Concatenated text from every marker we matched. May be JSON, plain
   *  text, or a mix. The caller's LLM call treats it as opaque text. */
  payload: string;
  /** True if any `<script>self.__next_f.push(...)</script>` was matched. */
  hadRsc: boolean;
  /** True if any non-RSC hydration marker was matched. */
  hadHydration: boolean;
}

const RSC_RE =
  /<script[^>]*>\s*self\.__next_f\s*=\s*self\.__next_f\s*\|\|\s*\[\]\s*<\/script>|<script[^>]*>\s*self\.__next_f\.push\(\s*(\[[\s\S]*?\])\s*\)\s*<\/script>/gi;

interface MarkerSpec {
  re: RegExp;
  /** Capture group index that holds the JSON / text payload. */
  group: number;
}

const HYDRATION_MARKERS: MarkerSpec[] = [
  // Next.js Pages Router
  {
    re: /<script\b[^>]*id\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    group: 1,
  },
  // Nuxt 3
  {
    re: /<script\b[^>]*id\s*=\s*["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    group: 1,
  },
  // Nuxt 2 (data-n-head ssr marker)
  {
    re: /<script\b[^>]*data-n-head\s*=\s*["']ssr["'][^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i,
    group: 1,
  },
  // SvelteKit
  {
    re: /<script\b[^>]*id\s*=\s*["']__SVELTEKIT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    group: 1,
  },
  // Apollo GraphQL hydration
  {
    re: /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/i,
    group: 1,
  },
  // Redux/Vuex SSR hydration (common patterns)
  {
    re: /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/i,
    group: 1,
  },
  {
    re: /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/i,
    group: 1,
  },
];

// Generic catch-all: any <script type="application/json"> not yet matched.
const GENERIC_JSON_RE =
  /<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;

export function extractHydration(html: string): HydrationResult {
  const chunks: string[] = [];

  // Pass 1: RSC __next_f.push chunks. Capture the array payload (group 1),
  // which is [tag:number, content:string]. We just keep the raw match text.
  let hadRsc = false;
  let rscMatch: RegExpExecArray | null;
  const rscRe = new RegExp(RSC_RE);
  while ((rscMatch = rscRe.exec(html)) !== null) {
    if (rscMatch[1]) {
      chunks.push(rscMatch[1]);
      hadRsc = true;
    }
  }

  // Pass 2: framework-specific markers (first match each).
  let hadHydration = false;
  for (const marker of HYDRATION_MARKERS) {
    const m = marker.re.exec(html);
    if (m && m[marker.group]) {
      chunks.push(m[marker.group].trim());
      hadHydration = true;
    }
  }

  // Pass 3: generic application/json catch-all. Only flag hadHydration if
  // we found something not already captured (cheap dedup by exact content).
  const seen = new Set(chunks.map((c) => c.trim()));
  let genericMatch: RegExpExecArray | null;
  const genRe = new RegExp(GENERIC_JSON_RE);
  while ((genericMatch = genRe.exec(html)) !== null) {
    const body = genericMatch[1]?.trim();
    if (body && !seen.has(body)) {
      chunks.push(body);
      seen.add(body);
      hadHydration = true;
    }
  }

  return {
    payload: chunks.join("\n"),
    hadRsc,
    hadHydration,
  };
}
