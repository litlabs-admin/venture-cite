import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearAllVentureCiteStorage } from "../../client/src/lib/clientStorage";

// Minimal in-memory localStorage shim for the Node test environment.
function makeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

describe("clearAllVentureCiteStorage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeLocalStorage());
  });

  it("removes all venturecite-* prefixed keys", () => {
    localStorage.setItem("venturecite-active-draft-id:user-1", "draft-abc");
    localStorage.setItem("venturecite-ga4-id", "GA-12345");
    localStorage.setItem("venturecite-gsc-url", "https://example.com");
    localStorage.setItem("venturecite-onboarding", '{"dismissed":true}');
    localStorage.setItem("venturecite-onboarding-seen:user-2", "2026-01-01");

    clearAllVentureCiteStorage();

    expect(localStorage.length).toBe(0);
  });

  it("removes legacy non-prefixed onboarding keys", () => {
    localStorage.setItem("hasSeenOnboarding", "true");
    localStorage.setItem("completedGuideSteps", "[1,2,3]");
    localStorage.setItem("venturecite-ga4-id", "GA-x");

    clearAllVentureCiteStorage();

    expect(localStorage.getItem("hasSeenOnboarding")).toBeNull();
    expect(localStorage.getItem("completedGuideSteps")).toBeNull();
    expect(localStorage.getItem("venturecite-ga4-id")).toBeNull();
  });

  it("preserves non-VentureCite keys (e.g. Supabase auth token)", () => {
    localStorage.setItem("sb-abcd-auth-token", "jwt-blob");
    localStorage.setItem("some-other-app-key", "value");
    localStorage.setItem("venturecite-ga4-id", "GA-x");

    clearAllVentureCiteStorage();

    expect(localStorage.getItem("sb-abcd-auth-token")).toBe("jwt-blob");
    expect(localStorage.getItem("some-other-app-key")).toBe("value");
    expect(localStorage.getItem("venturecite-ga4-id")).toBeNull();
  });

  it("is safe to call when storage is empty", () => {
    expect(() => clearAllVentureCiteStorage()).not.toThrow();
  });

  it("is safe to call when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
      get length(): number {
        throw new Error("denied");
      },
      key: () => null,
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    } as Storage);
    expect(() => clearAllVentureCiteStorage()).not.toThrow();
  });
});
