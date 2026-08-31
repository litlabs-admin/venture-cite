import { describe, expect, it, vi } from "vitest";
import { createRequestActor } from "../../server/lib/requestActor";
import {
  setRestrictedRequestContext,
  type RestrictedRequestRole,
} from "../../server/data/restrictedRequestTransaction";

// No database needed: this only proves the role-selection switch inside
// setRestrictedRequestContext itself - that it emits `set local role` for
// each role it claims to support (including the new entity-request role
// added alongside migrations 0124/0125), and that it refuses, loudly,
// anything it doesn't recognize instead of silently falling back to one of
// the roles it does. The prior shape was an if/else where any role other
// than "venturecite_request" fell through to "venturecite_content_request" -
// this test would have caught that.

function fakeTransaction() {
  const calls: string[] = [];
  return {
    calls,
    execute: vi.fn(async (query: any) => {
      // drizzle's sql`` tag builds a SQL object whose queryChunks array
      // holds the literal string segments (and bound params, which none of
      // these queries have except the GUC value).
      const text = Array.isArray(query?.queryChunks)
        ? query.queryChunks
            .map((chunk: any) =>
              Array.isArray(chunk?.value) ? chunk.value.join("") : String(chunk?.value ?? chunk),
            )
            .join("")
        : String(query);
      calls.push(text);
      return { rows: [] } as any;
    }),
  };
}

describe("setRestrictedRequestContext", () => {
  const actor = createRequestActor("11111111-1111-4111-8111-111111111111");

  it.each<RestrictedRequestRole>([
    "venturecite_request",
    "venturecite_content_request",
    "venturecite_entity_request",
  ])("issues `set local role` for %s", async (role) => {
    const transaction = fakeTransaction();
    await setRestrictedRequestContext({ actor, role, transaction: transaction as any });

    expect(transaction.execute).toHaveBeenCalled();
    const roleCall = transaction.calls[0];
    expect(roleCall).toContain(`set local role ${role}`);
    // The GUC and statement timeout still run for every admitted role.
    expect(transaction.calls.some((call) => call.includes("venturecite.user_id"))).toBe(true);
    expect(transaction.calls.some((call) => call.includes("statement_timeout"))).toBe(true);
  });

  it("admits venturecite_entity_request specifically", async () => {
    const transaction = fakeTransaction();
    await expect(
      setRestrictedRequestContext({
        actor,
        role: "venturecite_entity_request",
        transaction: transaction as any,
      }),
    ).resolves.toBeUndefined();
    expect(transaction.calls[0]).toContain("set local role venturecite_entity_request");
  });

  it("refuses an unknown role instead of defaulting to a known one", async () => {
    const transaction = fakeTransaction();
    const bogusRole = "venturecite_bogus_role" as unknown as RestrictedRequestRole;

    await expect(
      setRestrictedRequestContext({ actor, role: bogusRole, transaction: transaction as any }),
    ).rejects.toThrow(/Unsupported restricted request role/);

    // Nothing was executed - in particular, it must not have silently set
    // any of the real roles before discovering the role was unrecognized.
    expect(transaction.execute).not.toHaveBeenCalled();
  });
});
