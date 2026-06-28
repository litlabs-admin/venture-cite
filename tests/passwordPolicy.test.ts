import { describe, it, expect } from "vitest";
import { validatePassword, PASSWORD_RULES, PASSWORD_MAX_BYTES } from "../shared/passwordPolicy";

describe("validatePassword", () => {
  it("accepts a password meeting all rules", () => {
    expect(validatePassword("Abcdef12")).toEqual({ ok: true });
  });

  it("rejects each missing character class", () => {
    expect(validatePassword("abcdef12").ok).toBe(false); // no uppercase
    expect(validatePassword("ABCDEF12").ok).toBe(false); // no lowercase
    expect(validatePassword("Abcdefgh").ok).toBe(false); // no digit
    expect(validatePassword("Abc12").ok).toBe(false); // too short
  });

  it("rejects non-strings and empty input", () => {
    expect(validatePassword(undefined).ok).toBe(false);
    expect(validatePassword("").ok).toBe(false);
  });

  it("enforces the bcrypt limit in BYTES, not characters", () => {
    // 72 ASCII bytes (all classes present) is allowed; 73 is not.
    expect(validatePassword("A1" + "a".repeat(70))).toEqual({ ok: true }); // 72 bytes
    expect(validatePassword("A1" + "a".repeat(71)).ok).toBe(false); // 73 bytes
    // 38 chars but 73 UTF-8 bytes (é = 2 bytes) must still be rejected.
    const multibyte = "Aa1" + "é".repeat(35);
    expect(multibyte.length).toBeLessThan(PASSWORD_MAX_BYTES);
    expect(validatePassword(multibyte).ok).toBe(false);
  });

  it("exposes exactly the four rules the GoTrue preset encodes", () => {
    expect(PASSWORD_RULES).toHaveLength(4);
  });
});
