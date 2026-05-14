import { describe, it, expect } from "vitest";
import { detectLanguage } from "../../server/lib/factAgent/langDetect";

describe("detectLanguage", () => {
  it("reads ISO 639-1 from <html lang> attribute", () => {
    expect(detectLanguage('<!doctype html><html lang="es"><body>Hola</body></html>')).toBe("es");
  });

  it("normalizes regional tags to the language portion", () => {
    expect(detectLanguage('<html lang="en-US"><body>hi</body></html>')).toBe("en");
    expect(detectLanguage('<html lang="pt-BR"><body>oi</body></html>')).toBe("pt");
  });

  it("falls back to Latin heuristic when lang is absent", () => {
    expect(detectLanguage("<html><body>Welcome to our company about page</body></html>")).toBe(
      "en",
    );
  });

  it("detects CJK as zh/ja heuristically", () => {
    expect(detectLanguage("<html><body>我们公司是一家专注于AI的初创企业</body></html>")).toBe("zh");
  });

  it("detects Cyrillic as ru", () => {
    expect(detectLanguage("<html><body>Мы стартап работающий над ИИ</body></html>")).toBe("ru");
  });

  it("detects Arabic", () => {
    expect(detectLanguage("<html><body>نحن شركة ناشئة</body></html>")).toBe("ar");
  });

  it("returns 'und' for empty or tag-only HTML", () => {
    expect(detectLanguage("<html></html>")).toBe("und");
  });
});
