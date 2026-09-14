// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { V2_ICON_NAMES } from "@/v2/contracts/icons";
import { V2Icon } from "@/v2/theme/V2Icon";
import { V2_COLOR, V2_SERIES } from "@/v2/theme/tokens";
import { useV2MonoPortalScope } from "@/v2/theme/useV2MonoPortalScope";

const themeDirectory = resolve(process.cwd(), "client/src/v2/theme");
const indexCss = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
const monoCss = readFileSync(resolve(themeDirectory, "v2-mono.css"), "utf8");
const typographySource = readFileSync(resolve(themeDirectory, "typography.ts"), "utf8");

const requiredV2Colors = [
  ["--v2-ink", V2_COLOR.ink],
  ["--v2-ink2", V2_COLOR.ink2],
  ["--v2-ink3", V2_COLOR.ink3],
  ["--v2-ink4", V2_COLOR.ink4],
  ["--v2-line", V2_COLOR.line],
  ["--v2-line2", V2_COLOR.line2],
  ["--v2-paper", V2_COLOR.paper],
  ["--v2-inset", V2_COLOR.inset],
  ["--v2-brand", V2_COLOR.brand],
  ["--v2-brand-fill", V2_COLOR.brandFill],
  ["--v2-brand-press", V2_COLOR.brandPress],
  ["--v2-brand-soft", V2_COLOR.brandSoft],
  ["--v2-ok", V2_COLOR.ok],
  ["--v2-ok-soft", V2_COLOR.okSoft],
  ["--v2-bad", V2_COLOR.bad],
  ["--v2-bad-soft", V2_COLOR.badSoft],
  ["--v2-warn", V2_COLOR.warn],
  ["--v2-warn-soft", V2_COLOR.warnSoft],
  ["--v2-highlight", V2_COLOR.highlight],
  ["--v2-highlight-confirmed", V2_COLOR.highlightConfirmed],
  ["--v2-disabled-bg", V2_COLOR.disabledBg],
  ["--v2-radius", V2_COLOR.radius],
  ["--v2-radius-panel", V2_COLOR.radiusPanel],
] as const;

function cssValue(name: string): string {
  const match = monoCss.match(
    new RegExp(`${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*:\\s*([^;]+)`),
  );
  if (!match) throw new Error(`Missing CSS declaration: ${name}`);
  return match[1].trim();
}

function themeTokenNames(css: string): string[] {
  return [...css.matchAll(/@theme\s*\{([\s\S]*?)\n\}/g)].flatMap((block) =>
    [...block[1].matchAll(/^\s*(--(?:color|radius)-[\w-]+)\s*:/gm)].map((match) => match[1]),
  );
}

function monoTokenRule(): { selectors: string[]; declarations: string } {
  const match = monoCss.match(/((?:^|\n)[^{]*\.v2-mono[\s\S]*?)\s*\{([\s\S]*?)\n\}/);
  if (!match) throw new Error("Missing v2-mono token rule");

  return {
    selectors: match[1]
      .trim()
      .split(",")
      .map((selector) => selector.trim()),
    declarations: match[2],
  };
}

function declarationNames(declarations: string): string[] {
  return [...declarations.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]);
}

describe("V2Icon", () => {
  for (const name of V2_ICON_NAMES) {
    it(`renders a shape for ${name}`, () => {
      const { container } = render(<V2Icon name={name} />);
      const svg = container.querySelector("svg");

      expect(svg).toBeInTheDocument();
      expect(svg?.children.length).toBeGreaterThan(0);
    });
  }
});

describe("v2 monochrome theme", () => {
  it("keeps every CSS rule inside the v2-mono scope", () => {
    const withoutComments = monoCss.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...withoutComments.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim());

    expect(selectors.length).toBeGreaterThan(0);
    expect(
      selectors.every((selector) =>
        selector
          .split(",")
          .map((item) => item.trim())
          .every(
            (item) =>
              item === ".v2-mono" ||
              item === ".dark .v2-mono" ||
              item.startsWith("body.v2-mono-portal > "),
          ),
      ),
    ).toBe(true);
  });

  it("redeclares every color and radius alias from index.css", () => {
    const { declarations } = monoTokenRule();
    const declaredNames = new Set(declarationNames(declarations));

    for (const name of themeTokenNames(indexCss)) {
      expect(declaredNames, `Missing ${name} in the v2-mono rule`).toContain(name);
    }
  });

  it("uses the canvas type scale and radius scale", () => {
    expect(cssValue("--radius")).toBe("var(--v2-radius)");
    expect(cssValue("--radius-sm")).toBe("4px");
    expect(cssValue("--radius-md")).toBe("6px");
    expect(cssValue("--radius-lg")).toBe("8px");
    expect(cssValue("--radius-vc-panel")).toBe("var(--v2-radius-panel)");
    expect(cssValue("font-size")).toBe("14px");
    expect(cssValue("line-height")).toBe("1.5");
    expect(cssValue("font-optical-sizing")).toBe("none");
  });

  it("shares token declarations with every supported Radix portal selector", () => {
    const { selectors, declarations } = monoTokenRule();
    const portalSelectors = [
      "body.v2-mono-portal > [data-radix-popper-content-wrapper]",
      'body.v2-mono-portal > [role="dialog"]',
      'body.v2-mono-portal > [role="alertdialog"]',
      "body.v2-mono-portal > [data-radix-portal]",
    ];

    expect(selectors).toEqual(expect.arrayContaining([".v2-mono", ".dark .v2-mono"]));
    expect(selectors).toEqual(expect.arrayContaining(portalSelectors));
    expect(declarationNames(declarations)).toContain("--color-background");
  });

  it("reference-counts the v2 mono portal body class", () => {
    document.body.classList.remove("v2-mono-portal");

    const first = renderHook(() => useV2MonoPortalScope());
    const second = renderHook(() => useV2MonoPortalScope());

    expect(document.body).toHaveClass("v2-mono-portal");

    first.unmount();
    expect(document.body).toHaveClass("v2-mono-portal");

    second.unmount();
    expect(document.body).not.toHaveClass("v2-mono-portal");
  });

  it("declares the shared v2 token values from the TypeScript source", () => {
    for (const [name, value] of requiredV2Colors) {
      expect(cssValue(name)).toBe(value);
    }

    V2_SERIES.forEach((value, index) => {
      expect(cssValue(`--v2-series-${index + 1}`)).toBe(value);
    });
  });

  it("declares the full six-series chart ramp", () => {
    for (let index = 0; index < V2_SERIES.length; index += 1) {
      expect(cssValue(`--v2-series-${index + 1}`)).toBe(V2_SERIES[index]);
    }
  });

  it("keeps typography free of literal hex colors", () => {
    expect(typographySource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
