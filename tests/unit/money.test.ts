import { describe, it, expect } from "vitest";
import { dollarsToCents, centsToDisplay, centsToDollars } from "../../shared/money";

describe("dollarsToCents", () => {
  it("parses plain decimal strings", () => {
    expect(dollarsToCents("19.99")).toBe(1999);
    expect(dollarsToCents("0.50")).toBe(50);
    expect(dollarsToCents("1000")).toBe(100000);
    expect(dollarsToCents("0")).toBe(0);
  });

  it("strips currency symbols and grouping commas", () => {
    expect(dollarsToCents("$19.99")).toBe(1999);
    expect(dollarsToCents("$1,234.50")).toBe(123450);
    expect(dollarsToCents("USD 19.99")).toBe(1999);
  });

  it("trims whitespace", () => {
    expect(dollarsToCents("  19.99  ")).toBe(1999);
  });

  it("accepts JS numbers directly", () => {
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(dollarsToCents(1000)).toBe(100000);
    expect(dollarsToCents(0)).toBe(0);
  });

  it("returns null for non-numeric / empty input", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents(null)).toBeNull();
    expect(dollarsToCents(undefined)).toBeNull();
    expect(dollarsToCents(NaN)).toBeNull();
    expect(dollarsToCents(Infinity)).toBeNull();
  });

  it("handles negative values (refunds)", () => {
    expect(dollarsToCents("-19.99")).toBe(-1999);
    expect(dollarsToCents(-19.99)).toBe(-1999);
  });

  it("rounds sub-cent fractions to nearest cent", () => {
    expect(dollarsToCents("19.999")).toBe(2000);
    expect(dollarsToCents("19.991")).toBe(1999);
    expect(dollarsToCents("19.995")).toBe(2000);
  });

  it("avoids the float-precision trap on common values", () => {
    // 0.1 + 0.2 = 0.30000000000000004 — naive parsing loses a cent.
    // Math.round(0.30000000000000004 * 100) = 30, so we get it right.
    expect(dollarsToCents("0.30")).toBe(30);
    // Sum many $0.10 values exactly via cents arithmetic. 1000 × 10
    // cents = 10,000 cents = exactly $100 (not $99.99999... like a
    // naive float sum would produce).
    let total = 0;
    for (let i = 0; i < 1000; i++) total += dollarsToCents("0.10")!;
    expect(total).toBe(10_000);
  });
});

describe("centsToDisplay", () => {
  it("formats USD by default", () => {
    expect(centsToDisplay(1999)).toBe("$19.99");
    expect(centsToDisplay(0)).toBe("$0.00");
    expect(centsToDisplay(123450)).toBe("$1,234.50");
  });

  it("returns $0.00 for null / undefined / NaN", () => {
    expect(centsToDisplay(null)).toBe("$0.00");
    expect(centsToDisplay(undefined)).toBe("$0.00");
    expect(centsToDisplay(NaN)).toBe("$0.00");
  });

  it("respects currency override", () => {
    const eur = centsToDisplay(1999, "EUR", "en-US");
    expect(eur).toContain("19.99");
    expect(eur).toMatch(/[€EUR]/);
  });

  it("handles negative cents (refund display)", () => {
    expect(centsToDisplay(-1999)).toMatch(/-\$19\.99|\$-19\.99|\(\$19\.99\)/);
  });
});

describe("centsToDollars", () => {
  it("divides by 100 cleanly", () => {
    expect(centsToDollars(1999)).toBe(19.99);
    expect(centsToDollars(0)).toBe(0);
  });

  it("returns 0 for null / undefined", () => {
    expect(centsToDollars(null)).toBe(0);
    expect(centsToDollars(undefined)).toBe(0);
    expect(centsToDollars(NaN)).toBe(0);
  });
});
