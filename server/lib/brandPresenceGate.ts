export type GateInput = {
  title?: string | null;
  selftext?: string | null;
  body?: string | null;
  comment?: string | null;
};

export type GateResult =
  | { matched: false }
  | {
      matched: true;
      matchedVariation: string;
      matchedField: "title" | "selftext" | "body" | "comment";
    };

type MatchedField = "title" | "selftext" | "body" | "comment";

export function passesBrandPresenceGate(text: GateInput, variations: string[]): GateResult {
  const fields: Array<{ field: MatchedField; text: string }> = [
    { field: "title", text: (text.title ?? "").toLowerCase() },
    { field: "selftext", text: (text.selftext ?? "").toLowerCase() },
    { field: "body", text: (text.body ?? "").toLowerCase() },
    { field: "comment", text: (text.comment ?? "").toLowerCase() },
  ];
  // Sort longest variations first so multi-word variations take priority over single-word ones.
  const sorted = [...variations].sort((a, b) => b.length - a.length);
  for (const f of fields) {
    if (f.text.length === 0) continue;
    for (const v of sorted) {
      if (!v) continue;
      const needle = v.toLowerCase();
      if (f.text.includes(needle)) {
        return { matched: true, matchedVariation: v, matchedField: f.field };
      }
    }
  }
  return { matched: false };
}
