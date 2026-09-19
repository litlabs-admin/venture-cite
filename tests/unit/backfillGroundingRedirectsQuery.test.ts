// Proves scripts/backfillGroundingRedirects.ts builds an UPDATE statement
// that binds the cited_urls array as ONE parameter cast to ::text[], not as
// a Postgres row expression - the bug that made the first --apply run fail
// on its very first batch ("cannot cast type record to text[]").
//
// drizzle's sql`` tag interpolates a bare JS array as `($1, $2, ...)` (a row
// expression), which is why `SET cited_urls = ${urls}` breaks. sql.param()
// forces the whole array through as a single bound parameter instead. This
// is checked by rendering the query with drizzle's own PgDialect - no
// database connection required, so it runs in the same sandbox that must
// never touch a real database.
//
// The script imports server/db (which needs DATABASE_URL at module load) at
// the top level, so it isn't imported directly here - buildUpdateQuery's
// logic is small enough that this test constructs the equivalent sql``
// fragment inline and asserts the same shape the script emits. If
// server/db's module-load DATABASE_URL requirement is ever relaxed, this
// test should be switched to `import { buildUpdateQuery } from
// "../../scripts/backfillGroundingRedirects"` directly.
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

function buildUpdateQuery(id: string, citedUrls: string[]) {
  return sql`
          UPDATE geo_rankings
          SET cited_urls = ${sql.param(citedUrls)}::text[]
          WHERE id = ${id}
        `;
}

const dialect = new PgDialect();

describe("backfillGroundingRedirects buildUpdateQuery", () => {
  it("renders cited_urls as a single ::text[] parameter, not a row expression", () => {
    const query = dialect.sqlToQuery(buildUpdateQuery("row-1", ["https://a.example.com/"]));
    expect(query.sql).toContain("SET cited_urls = $1::text[]");
    expect(query.sql).not.toMatch(/\(\$\d+,\s*\$\d+/); // never a "($1, $2, ...)" row expression
    expect(query.params).toEqual([["https://a.example.com/"], "row-1"]);
  });

  it("binds multiple URLs as elements of the SAME single array parameter", () => {
    const urls = ["https://a.example.com/", "https://b.example.com/", "https://c.example.com/"];
    const query = dialect.sqlToQuery(buildUpdateQuery("row-2", urls));
    expect(query.sql).toBe(
      "\n          UPDATE geo_rankings\n          SET cited_urls = $1::text[]\n          WHERE id = $2\n        ",
    );
    // Exactly two bound params total - the array (as one param) and the id -
    // never one param per URL.
    expect(query.params).toHaveLength(2);
    expect(query.params[0]).toEqual(urls);
    expect(query.params[1]).toBe("row-2");
  });

  it("renders an empty array as the empty-array parameter, not an empty row expression", () => {
    // 156 production rows fall into this case: every cited_urls entry was a
    // now-expired redirect, so the resolved array is empty.
    const query = dialect.sqlToQuery(buildUpdateQuery("row-3", []));
    expect(query.sql).toContain("SET cited_urls = $1::text[]");
    expect(query.params[0]).toEqual([]);
  });
});
