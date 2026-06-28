import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { breachCountFromRange } from "../server/lib/leakedPassword";

// Network-free check of the HIBP range parser — the security-relevant logic.
// The live fetch in isPasswordLeaked is fail-open and not unit-tested here.
const sha1Upper = (s: string) => createHash("sha1").update(s, "utf8").digest("hex").toUpperCase();

describe("breachCountFromRange", () => {
  it("flags a known-pwned password whose suffix is in the range body", () => {
    // "password" → 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    const h = sha1Upper("password");
    const body = `${h.slice(5)}:3861493\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1`;
    expect(breachCountFromRange(h, body)).toBe(3861493);
  });

  it("returns 0 when the suffix is absent (ignores other / padding entries)", () => {
    const h = sha1Upper("a-very-unlikely-unique-passphrase-2026");
    const body = `0000000000000000000000000000000000A:0\r\n1111111111111111111111111111111111B:5`;
    expect(breachCountFromRange(h, body)).toBe(0);
  });

  it("matches the suffix case-insensitively", () => {
    const h = sha1Upper("password");
    const body = `${h.slice(5).toLowerCase()}:42`;
    expect(breachCountFromRange(h, body)).toBe(42);
  });
});
