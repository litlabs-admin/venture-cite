import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  configureDestructiveDatabaseTest,
  type DestructiveDatabaseTestState,
} from "../helpers/destructiveDatabaseTest";

const databaseTest: DestructiveDatabaseTestState =
  process.env.LOCAL_SUPABASE_TEST === "1" && process.env.TEST_DATABASE_URL
    ? configureDestructiveDatabaseTest(process.env)
    : { kind: "skip" };
const runLocally = databaseTest.kind === "ready" && process.env.LOCAL_SUPABASE_TEST === "1";
const describeIfLocal = runLocally ? describe : describe.skip;
const runtime = runLocally ? await import("../../server/db") : null;
const budget = runLocally ? await import("../../server/lib/llmBudget") : null;
const testUserId = `content-cost-test-${process.pid}-${Date.now()}`;
const testKey = `content-cost:test-job-${process.pid}:test-response-${Date.now()}`;

describeIfLocal("local content cost idempotency", () => {
  beforeAll(async () => {
    await runtime!.pool.query("insert into public.users (id) values ($1)", [testUserId]);
  });

  afterAll(async () => {
    await runtime!.pool.query("delete from public.api_costs where idempotency_key = $1", [testKey]);
    await runtime!.pool.query("delete from public.users where id = $1", [testUserId]);
    await runtime!.pool.end();
  });

  it("records one row when the same direct cost command is delivered twice", async () => {
    await budget!.recordSpend({
      userId: testUserId,
      service: "local-test",
      model: "local-test-model",
      tokensIn: 10,
      tokensOut: 20,
      idempotencyKey: testKey,
    });
    await budget!.recordSpend({
      userId: testUserId,
      service: "local-test",
      model: "local-test-model",
      tokensIn: 10,
      tokensOut: 20,
      idempotencyKey: testKey,
    });

    const result = await runtime!.pool.query<{ count: number }>(
      "select count(*)::int as count from public.api_costs where idempotency_key = $1",
      [testKey],
    );
    expect(result.rows).toEqual([{ count: 1 }]);
  });
});
