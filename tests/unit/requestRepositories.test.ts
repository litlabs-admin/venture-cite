import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
vi.mock("../../server/db", () => ({ db: {} }));
import { createRequestActor } from "../../server/lib/requestActor";
import { createRequestBrandRepository } from "../../server/data/requestBrandRepository";
import { createRequestUserRepository } from "../../server/data/requestUserRepository";
import { createRequestData } from "../../server/data/requestData";

const USER_A_ID = "11111111-1111-4111-8111-111111111111";
const USER_B_ID = "22222222-2222-4222-8222-222222222222";

type Rows = Record<string, unknown>[];

function createTransaction(rows: Rows) {
  const select = vi.fn();
  const insert = vi.fn();
  const update = vi.fn();
  const execute = vi.fn().mockResolvedValue({ rows: [{ id: "brand-a" }] });
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    values: vi.fn(),
    set: vi.fn(),
    returning: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.values.mockReturnValue(chain);
  chain.set.mockReturnValue(chain);
  chain.returning.mockResolvedValue(rows);
  chain.limit.mockResolvedValue(rows);
  Object.assign(chain, {
    then(resolve: (value: Rows) => unknown) {
      return Promise.resolve(rows).then(resolve);
    },
  });
  select.mockReturnValue(chain);
  insert.mockReturnValue(chain);
  update.mockReturnValue(chain);

  const transaction = { select, insert, update, execute };
  return {
    database: {
      transaction: vi.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    },
    calls: {
      select,
      insert,
      update,
      execute,
      values: chain.values,
      set: chain.set,
      where: chain.where,
    },
  };
}

describe("request user repository", () => {
  it("returns the current user's restricted profile", async () => {
    const { database } = createTransaction([{ id: USER_A_ID, email: "a@example.test" }]);
    const repository = createRequestUserRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(repository.get()).resolves.toEqual({ id: USER_A_ID, email: "a@example.test" });
  });

  it("returns no profile when the request transaction finds no user", async () => {
    const { database } = createTransaction([]);
    const repository = createRequestUserRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(repository.get()).resolves.toBeUndefined();
  });

  it("updates only the current user's profile", async () => {
    const { database, calls } = createTransaction([{ id: USER_A_ID, firstName: "Ada" }]);
    const repository = createRequestUserRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(repository.updateProfile({ firstName: "Ada" })).resolves.toEqual({
      id: USER_A_ID,
      firstName: "Ada",
    });
    expect(calls.set).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Ada" }));
  });
});

describe("request brand repository", () => {
  it("lists only brands returned by the request transaction", async () => {
    const { database, calls } = createTransaction([{ id: "brand-a", userId: USER_A_ID }]);
    const repository = createRequestBrandRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(repository.list()).resolves.toEqual([{ id: "brand-a", userId: USER_A_ID }]);
    const projection = calls.select.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(projection).toEqual(
      expect.objectContaining({ id: expect.anything(), name: expect.anything() }),
    );
    expect(projection).not.toHaveProperty("autopilotError");
    expect(projection).not.toHaveProperty("deletionScheduledFor");
  });

  it("returns no brand when the request transaction cannot see it", async () => {
    const { database } = createTransaction([]);
    const repository = createRequestBrandRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(repository.get("brand-b")).resolves.toBeUndefined();
  });

  it("inserts only approved columns and sets the current user as the brand owner", async () => {
    const { database, calls } = createTransaction([{ id: "brand-a", userId: USER_A_ID }]);
    const repository = createRequestBrandRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await repository.create({ name: "A", companyName: "A Inc", industry: "Software" });

    const statement = calls.execute.mock.calls
      .map(([value]) => value as SQL)
      .find((value) => new PgDialect().sqlToQuery(value).sql.includes("insert into"));
    expect(statement).toBeDefined();
    const query = new PgDialect().sqlToQuery(statement);
    expect(query.params).toContain(USER_A_ID);
    expect(query.sql).toContain('insert into "public"."brands"');
    expect(query.sql).toContain('"user_id", "name", "company_name", "industry", "tone"');
    const insertColumns = query.sql.match(/\(([^)]+)\)\s+values/i)?.[1] ?? "";
    for (const column of [
      "id",
      "autopilot_status",
      "autopilot_step",
      "autopilot_started_at",
      "autopilot_completed_at",
      "autopilot_error",
      "autopilot_progress",
      "auto_citation_schedule",
      "auto_citation_day",
      "auto_citation_hour",
      "auto_citation_active",
      "last_auto_citation_at",
      "last_auto_citation_status",
      "version",
      "deleted_at",
      "deletion_scheduled_for",
      "monitor_mentions",
      "created_at",
      "updated_at",
    ]) {
      expect(insertColumns).not.toContain(`"${column}"`);
    }
  });

  it("updates a visible brand and returns no result for another user's brand", async () => {
    const { database, calls } = createTransaction([]);
    const repository = createRequestBrandRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await expect(repository.update("brand-b", { name: "Changed" })).resolves.toBeUndefined();
    expect(calls.set).toHaveBeenCalledWith(expect.objectContaining({ name: "Changed" }));

    const predicate = calls.where.mock.calls[0]?.[0] as SQL;
    expect(predicate).toBeDefined();
    const query = new PgDialect().sqlToQuery(predicate);
    expect(query.sql).toContain('"brands"."user_id" =');
    expect(query.params).toContain(USER_A_ID);
    expect(query.params).not.toContain(USER_B_ID);
  });

  it("uses the content request role for deletion preview counts", async () => {
    const { database, calls } = createTransaction([{ id: "brand-a" }]);
    const repository = createRequestBrandRepository({
      actor: createRequestActor(USER_A_ID),
      database: database as never,
    });

    await repository.deletionPreview("brand-a");

    const statements = calls.execute.mock.calls.map(
      ([value]) => new PgDialect().sqlToQuery(value as SQL).sql,
    );
    expect(statements).toContain("set local role venturecite_content_request");
  });
});

describe("request data boundary", () => {
  it("returns a durable actor facade whose methods use separate restricted transactions", async () => {
    const { database, calls } = createTransaction([{ id: "brand-a", userId: USER_A_ID }]);
    const requestData = createRequestData(database as never);

    const facade = requestData.forActor(createRequestActor(USER_A_ID));
    expect(facade).not.toHaveProperty("execute");
    expect(facade).not.toHaveProperty("transaction");
    expect(facade).not.toHaveProperty("actor");
    await facade.brands.create({
      name: "A",
      companyName: "A Inc",
      industry: "Software",
    });
    await facade.brands.list();

    expect(Object.keys(facade).sort()).toEqual(["brands", "users"]);
    expect(database.transaction).toHaveBeenCalledTimes(2);
    const insertStatement = calls.execute.mock.calls
      .map(([value]) => value as SQL)
      .find((value) => new PgDialect().sqlToQuery(value).sql.includes("insert into"));
    expect(insertStatement).toBeDefined();
    const insert = new PgDialect().sqlToQuery(insertStatement);
    expect(insert.params).toContain(USER_A_ID);
    expect(insert.params).not.toContain(USER_B_ID);
  });
});
