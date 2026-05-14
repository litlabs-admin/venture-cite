import { describe, it, expect } from "vitest";
import { extractHydration } from "../../server/lib/factAgent/v2/rscExtractor";

describe("extractHydration", () => {
  it("captures __next_f.push chunks (App Router RSC)", () => {
    const html = `
      <html><body>
      <script>self.__next_f=self.__next_f||[]</script>
      <script>self.__next_f.push([1,"about\\nLit Labs is an AI agency"])</script>
      <script>self.__next_f.push([0,"team:[\\"Alice\\",\\"Bob\\"]"])</script>
      </body></html>`;
    const out = extractHydration(html);
    expect(out.hadRsc).toBe(true);
    expect(out.payload).toContain("Lit Labs is an AI agency");
    expect(out.payload).toContain("Alice");
  });

  it("captures __NEXT_DATA__ blob (Pages Router)", () => {
    const html = `
      <html><body>
      <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"description":"Hello world"}}}
      </script>
      </body></html>`;
    const out = extractHydration(html);
    expect(out.hadHydration).toBe(true);
    expect(out.payload).toContain("Hello world");
  });

  it("captures __NUXT_DATA__ (Nuxt 3)", () => {
    const html = `
      <script id="__NUXT_DATA__" type="application/json">
      ["myco","Nuxt-fact"]
      </script>`;
    const out = extractHydration(html);
    expect(out.hadHydration).toBe(true);
    expect(out.payload).toContain("Nuxt-fact");
  });

  it("captures window.__INITIAL_STATE__ via regex", () => {
    const html = `
      <script>
      window.__INITIAL_STATE__ = {"company":"Acme","tagline":"We build."};
      </script>`;
    const out = extractHydration(html);
    expect(out.hadHydration).toBe(true);
    expect(out.payload).toContain("We build.");
  });

  it("captures generic <script type=application/json>", () => {
    const html = `
      <script type="application/json">{"k":"v-generic"}</script>`;
    const out = extractHydration(html);
    expect(out.hadHydration).toBe(true);
    expect(out.payload).toContain("v-generic");
  });

  it("returns hadRsc=false hadHydration=false on a plain HTML page", () => {
    const html = `<html><body><h1>Hello</h1></body></html>`;
    const out = extractHydration(html);
    expect(out.hadRsc).toBe(false);
    expect(out.hadHydration).toBe(false);
    expect(out.payload).toBe("");
  });
});
