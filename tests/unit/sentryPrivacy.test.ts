import { describe, expect, it } from "vitest";
import { redactSentryValue } from "../../server/instrument";

describe("redactSentryValue", () => {
  it("removes personal names, contact fields, and email addresses from Sentry data", () => {
    const event = {
      user: { id: "user-1", email: "person@example.com", name: "A Person" },
      extra: {
        contactName: "A Person",
        contact: { name: "A Contact" },
        company: "Example Ltd",
        detail: "person@example.com",
      },
      exception: {
        values: [{ type: "TypeError", value: "Email person@example.com failed" }],
      },
    };

    expect(redactSentryValue(event)).toEqual({
      user: { id: "user-1", email: "[redacted]", name: "[redacted]" },
      extra: {
        contactName: "[redacted]",
        contact: { name: "[redacted]" },
        company: "[redacted]",
        detail: "[redacted]",
      },
      exception: {
        values: [{ type: "TypeError", value: "Email [redacted] failed" }],
      },
    });
  });
});
