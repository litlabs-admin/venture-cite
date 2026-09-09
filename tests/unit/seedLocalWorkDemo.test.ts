import { afterEach, describe, expect, it, vi } from "vitest";

// If the guard did not run first, this mock would be exercised - `execute`
// would be called while seeding brand_goals, work_outcome_reviews, or
// brand_fact_scrape_pages. Asserting it is never called is what proves the
// guard ran before any write, not merely that the guard "would" throw.
const execute = vi.fn();
vi.mock("../../server/db", () => ({
  db: { execute },
}));

import { seedLocalWorkDemo } from "../../scripts/seedLocalWorkDemo";

const originalUrl = process.env.DATABASE_URL;
const originalDirectUrl = process.env.DATABASE_DIRECT_URL;

function restoreEnv(): void {
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
  if (originalDirectUrl === undefined) delete process.env.DATABASE_DIRECT_URL;
  else process.env.DATABASE_DIRECT_URL = originalDirectUrl;
}

describe("seedLocalWorkDemo guard", () => {
  afterEach(() => {
    restoreEnv();
    execute.mockClear();
  });

  it("refuses a non-loopback DATABASE_URL and writes nothing", async () => {
    process.env.DATABASE_URL =
      "postgresql://u:p@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres";

    await expect(seedLocalWorkDemo()).rejects.toThrow(/non-local database/i);
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses a non-loopback DATABASE_DIRECT_URL even when DATABASE_URL is local, and writes nothing", async () => {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
    process.env.DATABASE_DIRECT_URL =
      "postgresql://u:p@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";

    await expect(seedLocalWorkDemo()).rejects.toThrow(/DATABASE_DIRECT_URL/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses when DATABASE_URL is unset, and writes nothing", async () => {
    delete process.env.DATABASE_URL;

    await expect(seedLocalWorkDemo()).rejects.toThrow(/DATABASE_URL is not set/i);
    expect(execute).not.toHaveBeenCalled();
  });
});
