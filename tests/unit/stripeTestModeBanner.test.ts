// Running a deployed environment on Stripe test keys is deliberate and
// temporary - it is the only way to click the payment flow through with
// Stripe's test cards, which the live API rejects outright.
//
// What makes it dangerous is that it is SILENT. On test keys every checkout
// succeeds, entitlements are granted, and no money moves; nothing anywhere
// looks wrong. These guards are what keep the state visible, and therefore
// temporary.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

describe("stripe test mode is announced", () => {
  it("detects test mode from the secret key", () => {
    const client = read("server/stripeClient.ts");
    expect(client).toContain("export function isStripeTestMode");
    expect(client).toContain('startsWith("sk_test_")');
  });

  it("reports it on the catalogue endpoint the UI already fetches", () => {
    // Riding along on an existing request keeps the banner free of an extra
    // round trip, and leaks nothing the publishable key does not.
    expect(read("server/routes/billing.ts")).toContain("testMode: isStripeTestMode()");
  });

  it("warns on every production boot", () => {
    const setup = read("server/setupProducts.ts");
    expect(setup).toContain('process.env.NODE_ENV === "production" && isStripeTestMode()');
    expect(setup).toContain("STRIPE IS IN TEST MODE");
  });

  it("shows a banner in the app and on the pricing page", () => {
    // Pricing sits outside AppShell, so it needs its own - and it is the page
    // where the card is actually entered.
    expect(read("client/src/components/AppShell.tsx")).toContain("<TestModeBanner />");
    expect(read("client/src/pages/pricing.tsx")).toContain("<TestModeBanner />");
  });

  it("cannot be dismissed", () => {
    // A banner you can hide is one you stop seeing on the day it matters.
    const gate = read("client/src/components/TrialGate.tsx");
    const banner = gate.slice(
      gate.indexOf("export function TestModeBanner"),
      gate.indexOf("export function TrialBanner"),
    );
    expect(banner).not.toContain("useState");
    expect(banner).not.toContain("dismiss");
  });

  it("renders nothing on live keys", () => {
    const gate = read("client/src/components/TrialGate.tsx");
    expect(gate).toContain("if (!data?.testMode) return null;");
  });
});
