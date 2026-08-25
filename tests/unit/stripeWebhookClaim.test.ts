import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const stubs = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("../../server/db", () => ({ db: { execute: stubs.execute }, pool: {} }));

const {
  claimStripeWebhookEvent,
  completeStripeWebhookEvent,
  maintainStripeWebhookClaim,
  renewStripeWebhookEvent,
} = await import("../../server/lib/stripeWebhookClaim");

beforeEach(() => vi.clearAllMocks());

describe("Stripe webhook processing claims", () => {
  it("claims a new event with one atomic statement", async () => {
    stubs.execute.mockResolvedValue({ rows: [{ processing_token: "claim-token" }] });
    await expect(claimStripeWebhookEvent("evt_1", "invoice.paid")).resolves.toEqual({
      kind: "claimed",
      token: "claim-token",
    });

    const statement = sqlText(stubs.execute.mock.calls[0]?.[0]);
    expect(statement).toContain("on conflict (event_id) do update");
    expect(statement).toContain("processing_started_at < now() - interval '5 minutes'");
    expect(statement).toContain("processed_at is null");
    expect(statement).toContain("returning processing_token");
  });

  it("reports a busy event while another request owns its lease", async () => {
    stubs.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ processed_at: null }] });
    await expect(claimStripeWebhookEvent("evt_1", "invoice.paid")).resolves.toEqual({
      kind: "busy",
    });
  });

  it("reports an event that a prior request completed", async () => {
    stubs.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ processed_at: new Date() }] });
    await expect(claimStripeWebhookEvent("evt_1", "invoice.paid")).resolves.toEqual({
      kind: "complete",
    });
  });

  it("completes only the claim that owns the token", async () => {
    stubs.execute.mockResolvedValue({ rows: [{ event_id: "evt_1" }] });
    await expect(completeStripeWebhookEvent("evt_1", "claim-token")).resolves.toBe(true);
    const statement = sqlText(stubs.execute.mock.calls[0]?.[0]);
    expect(statement).toContain("processing_token = $2");
    expect(statement).toContain("processed_at is null");
    expect(statement).toContain("returning event_id");
  });

  it("reports lost ownership when completion updates no row", async () => {
    stubs.execute.mockResolvedValue({ rows: [] });
    await expect(completeStripeWebhookEvent("evt_1", "stale-token")).resolves.toBe(false);
  });

  it("renews only the claim that owns the token", async () => {
    stubs.execute.mockResolvedValue({ rows: [{ event_id: "evt_1" }] });
    await expect(renewStripeWebhookEvent("evt_1", "claim-token")).resolves.toBe(true);
    const statement = sqlText(stubs.execute.mock.calls[0]?.[0]);
    expect(statement).toContain("processing_started_at = now()");
    expect(statement).toContain("processing_token = $2");
    expect(statement).toContain("processed_at is null");
    expect(statement).toContain("returning event_id");
  });

  it("renews an active claim until the handler stops it", async () => {
    vi.useFakeTimers();
    stubs.execute.mockResolvedValue({ rows: [{ event_id: "evt_1" }] });
    const lease = maintainStripeWebhookClaim("evt_1", "claim-token", 1_000);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(stubs.execute).toHaveBeenCalledTimes(1);
    expect(sqlText(stubs.execute.mock.calls[0]?.[0])).toContain("processing_started_at = now()");

    await lease.stop();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(stubs.execute).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("reports lost ownership before the handler starts another side effect", async () => {
    vi.useFakeTimers();
    stubs.execute.mockResolvedValue({ rows: [] });
    const lease = maintainStripeWebhookClaim("evt_1", "stale-token", 1_000);

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(lease.assertOwned()).rejects.toThrow("lost its processing claim");
    await lease.stop();
    vi.useRealTimers();
  });
});

function sqlText(statement: unknown): string {
  return new PgDialect()
    .sqlToQuery(statement as SQL)
    .sql.replace(/\s+/g, " ")
    .trim();
}
