import { describe, it, expect } from "vitest";
import {
  RAW_RESPONSE_DELIMITER,
  LEGACY_RAW_RESPONSE_DELIMITER,
  buildCitationContext,
  splitCitationContext,
} from "../../server/lib/citationContextFormat";

// This is the consolidation target for B7-06: six files used to each hold
// their own copy (or their own hardcoded literal) of the "||| RAW_RESPONSE
// |||" delimiter. The whole point of consolidating them behind one module is
// that a writer and a reader can no longer silently disagree about the
// marker - a round trip through build then split must always recover the
// original pieces.
describe("citationContextFormat: writer/reader round trip", () => {
  it("splitCitationContext undoes buildCitationContext for a normal snippet + response", () => {
    const stored = buildCitationContext("Cited", "The model's full answer text.");
    const { snippet, fullResponse } = splitCitationContext(stored);
    expect(snippet).toBe("Cited");
    expect(fullResponse).toBe("The model's full answer text.");
  });

  it("round-trips an empty raw response as null, not empty string", () => {
    const stored = buildCitationContext("Not cited", "");
    const { snippet, fullResponse } = splitCitationContext(stored);
    expect(snippet).toBe("Not cited");
    expect(fullResponse).toBeNull();
  });

  it("round-trips a multi-paragraph raw response verbatim", () => {
    const raw = "Paragraph one.\n\nParagraph two mentions ||| something unrelated.";
    const stored = buildCitationContext("Cited", raw);
    const { fullResponse } = splitCitationContext(stored);
    expect(fullResponse).toBe(raw);
  });

  // This is the failure mode the consolidation exists to prevent: if a
  // writer and a reader independently hardcode the delimiter string, one of
  // them can drift. Asserting the split against the literal string (not the
  // constant) proves the current contract, and the "prove it" step in the
  // audit flips RAW_RESPONSE_DELIMITER's value to confirm this specific
  // assertion is what catches drift.
  it("splits on the exact current delimiter literal", () => {
    expect(RAW_RESPONSE_DELIMITER).toBe("||| RAW_RESPONSE |||");
    const stored = `Cited\n\n${RAW_RESPONSE_DELIMITER}\nbody text`;
    expect(splitCitationContext(stored)).toEqual({ snippet: "Cited", fullResponse: "body text" });
  });

  it("still parses rows written in the legacy pre-2026-04-16 format", () => {
    const legacy = `Cited\n\n${LEGACY_RAW_RESPONSE_DELIMITER}\nold body text`;
    expect(splitCitationContext(legacy)).toEqual({
      snippet: "Cited",
      fullResponse: "old body text",
    });
  });

  it("treats a string with neither marker as an unsplit snippet", () => {
    expect(splitCitationContext("just a status line, no delimiter")).toEqual({
      snippet: "just a status line, no delimiter",
      fullResponse: null,
    });
  });

  it("returns null/null for null or empty input", () => {
    expect(splitCitationContext(null)).toEqual({ snippet: null, fullResponse: null });
    expect(splitCitationContext(undefined)).toEqual({ snippet: null, fullResponse: null });
    expect(splitCitationContext("")).toEqual({ snippet: null, fullResponse: null });
  });
});
