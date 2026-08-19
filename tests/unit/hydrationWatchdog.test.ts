import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// The landing page ships from SSR with every section at opacity-0 and reveals
// it only after hydration, so a failed hydration renders a blank white page.
// The watchdog in src/routes/__root.tsx is what stops that: it removes the
// `js` class from <html> unless client/src/main.tsx confirms hydration
// finished, and the CSS in pages/landing/styles.css forces the content
// visible whenever that class is absent.
//
// The script is a plain string (it must run before hydration, so it cannot be
// a React side effect) and therefore is not covered by any type check. These
// tests evaluate the real string out of the real file - not a copy - against a
// stub document, so the file and the test cannot drift apart.

function loadWatchdogScript(): string {
  const src = readFileSync(path.resolve(__dirname, "../../src/routes/__root.tsx"), "utf8");
  const match = src.match(/const THEME_FOUC_SCRIPT = `([\s\S]*?)`;/);
  if (!match) throw new Error("THEME_FOUC_SCRIPT not found in __root.tsx");
  return match[1];
}

function makeStubDom() {
  const classes = new Set<string>();
  const attrs = new Set<string>();
  const listeners: Record<string, Array<() => void>> = {};
  const docEl = {
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
    },
    style: {} as Record<string, string>,
    hasAttribute: (a: string) => attrs.has(a),
    setAttribute: (a: string) => attrs.add(a),
  };
  return {
    classes,
    attrs,
    fire: (evt: string) => (listeners[evt] ?? []).forEach((fn) => fn()),
    document: { documentElement: docEl },
    window: {
      localStorage: {
        getItem: () => null,
      },
      matchMedia: undefined,
      addEventListener: (evt: string, fn: () => void) => {
        (listeners[evt] ??= []).push(fn);
      },
    },
  };
}

function run(dom: ReturnType<typeof makeStubDom>) {
  const fn = new Function("document", "window", "setTimeout", loadWatchdogScript());
  fn(dom.document, dom.window, setTimeout);
}

describe("hydration watchdog", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("marks the document as js-capable immediately", () => {
    const dom = makeStubDom();
    run(dom);
    // Before any timer or load event, content must stay hidden so the
    // entrance animation still plays on a healthy page.
    expect(dom.classes.has("js")).toBe(true);
  });

  it("keeps the class when hydration reports success", () => {
    const dom = makeStubDom();
    run(dom);
    // What client/src/main.tsx does after hydrateRoot() returns.
    dom.document.documentElement.setAttribute("data-hydrated");

    dom.fire("load");
    vi.advanceTimersByTime(10_000);

    expect(dom.classes.has("js")).toBe(true);
  });

  it("drops the class when hydration never reports, via the load event", () => {
    const dom = makeStubDom();
    run(dom);

    // A bundle that 404s or is blocked: load fires, nothing hydrated.
    dom.fire("load");

    expect(dom.classes.has("js")).toBe(false);
  });

  it("drops the class when hydration never reports and load never fires", () => {
    const dom = makeStubDom();
    run(dom);

    // A request that hangs, or a script that parses then throws during
    // hydration. No load event ever arrives, so only the timer saves us.
    vi.advanceTimersByTime(4000);

    expect(dom.classes.has("js")).toBe(false);
  });

  it("does not blank the page early - the timer waits for a slow hydrate", () => {
    const dom = makeStubDom();
    run(dom);

    vi.advanceTimersByTime(3999);
    expect(dom.classes.has("js")).toBe(true);

    dom.document.documentElement.setAttribute("data-hydrated");
    vi.advanceTimersByTime(1);
    expect(dom.classes.has("js")).toBe(true);
  });

  it("survives a browser with no addEventListener", () => {
    const dom = makeStubDom();
    (dom.window as { addEventListener?: unknown }).addEventListener = undefined;

    expect(() => run(dom)).not.toThrow();
    vi.advanceTimersByTime(4000);
    expect(dom.classes.has("js")).toBe(false);
  });
});

describe("legacy runtime polyfills in the watchdog script", () => {
  it("defines working Object.hasOwn and Array.prototype.at when absent", () => {
    const dom = makeStubDom();
    const saved = { hasOwn: Object.hasOwn, at: Array.prototype.at };
    // Simulate Safari below 15.4, where both are missing.
    delete (Object as { hasOwn?: unknown }).hasOwn;
    delete (Array.prototype as { at?: unknown }).at;
    try {
      run(dom);
      expect(Object.hasOwn({ a: 1 }, "a")).toBe(true);
      expect(Object.hasOwn({ a: 1 }, "b")).toBe(false);
      expect([1, 2, 3].at(0)).toBe(1);
      expect([1, 2, 3].at(-1)).toBe(3);
      expect([1, 2, 3].at(5)).toBeUndefined();
      expect([1, 2, 3].at(-9)).toBeUndefined();
    } finally {
      Object.hasOwn = saved.hasOwn;
      Array.prototype.at = saved.at;
    }
  });
});
