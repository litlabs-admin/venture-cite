import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { USER_SCOPED_STORAGE_KEYS } from "../../client/src/lib/clientStorageKeys";

const SOURCE_ROOTS = ["client/src", "src"];
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const STORAGE_AREA_NAMES = new Set(["localStorage", "sessionStorage"]);
const STORAGE_PREFIX = "venturecite-";
const USER_SCOPED_KEY_SET = new Set<string>(USER_SCOPED_STORAGE_KEYS);
const USER_SCOPED_IDENTIFIERS = new Set([
  "accountId",
  "brandId",
  "email",
  "user",
  "userEmail",
  "userId",
]);

type StaticValue = { kind: "literal" | "prefix"; value: string };

type ConstantDeclaration = {
  initializer: ts.Expression;
};

type StorageFinding = {
  file: string;
  line: number;
  key: string;
  operation: "setItem" | "usePersistedState";
  userScoped: boolean;
};

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.has(extname(path)) ? [path] : [];
  });
}

function scriptKindFor(file: string): ts.ScriptKind {
  return extname(file) === ".tsx" || extname(file) === ".jsx"
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
}

function unwrap(expression: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return unwrap(expression.expression);
  }
  return expression;
}

function collectConstantDeclarations(
  files: readonly ts.SourceFile[],
): Map<string, ConstantDeclaration[]> {
  const declarations = new Map<string, ConstantDeclaration[]>();

  for (const file of files) {
    file.forEachChild(function visit(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const existing = declarations.get(node.name.text) ?? [];
        existing.push({ initializer: node.initializer });
        declarations.set(node.name.text, existing);
      }
      ts.forEachChild(node, visit);
    });
  }

  return declarations;
}

function resolveStaticValue(
  expression: ts.Expression,
  declarations: ReadonlyMap<string, ConstantDeclaration[]>,
  resolving: ReadonlySet<string> = new Set(),
): StaticValue | null {
  const value = unwrap(expression);

  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
    return { kind: "literal", value: value.text };
  }

  if (ts.isIdentifier(value)) {
    if (resolving.has(value.text)) return null;
    const nextResolving = new Set(resolving).add(value.text);
    const candidates = (declarations.get(value.text) ?? [])
      .map((declaration) =>
        resolveStaticValue(declaration.initializer, declarations, nextResolving),
      )
      .filter((candidate): candidate is StaticValue => candidate !== null);
    if (
      candidates.length === 0 ||
      candidates.some((candidate) => candidate.value !== candidates[0].value)
    ) {
      return null;
    }
    return candidates[0];
  }

  if (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = resolveStaticValue(value.left, declarations, resolving);
    const right = resolveStaticValue(value.right, declarations, resolving);
    if (left?.kind === "literal" && right?.kind === "literal") {
      return { kind: "literal", value: left.value + right.value };
    }
    if (left?.kind === "prefix" && right === null) return left;
    return null;
  }

  if (ts.isTemplateExpression(value)) {
    let result = value.head.text;
    for (const span of value.templateSpans) {
      const expressionValue = resolveStaticValue(span.expression, declarations, resolving);
      if (expressionValue === null) {
        return result.length > 0 ? { kind: "prefix", value: result } : null;
      }
      result += expressionValue.value + span.literal.text;
    }
    return { kind: "literal", value: result };
  }

  return null;
}

function resolveStringList(
  name: string,
  declarations: ReadonlyMap<string, ConstantDeclaration[]>,
): string[] {
  const declaration = declarations.get(name)?.[0];
  if (!declaration) return [];
  const initializer = unwrap(declaration.initializer);
  const elements = ts.isArrayLiteralExpression(initializer)
    ? initializer.elements
    : ts.isNewExpression(initializer) &&
        initializer.arguments?.length === 1 &&
        ts.isArrayLiteralExpression(unwrap(initializer.arguments[0]))
      ? unwrap(initializer.arguments[0]).elements
      : [];

  return elements.flatMap((element) => {
    const value = resolveStaticValue(element, declarations);
    return value?.kind === "literal" ? [value.value] : [];
  });
}

function storageArea(expression: ts.Expression): string | null {
  const value = unwrap(expression);
  if (ts.isIdentifier(value) && STORAGE_AREA_NAMES.has(value.text)) return value.text;
  if (
    ts.isPropertyAccessExpression(value) &&
    ts.isIdentifier(value.expression) &&
    (value.expression.text === "window" || value.expression.text === "globalThis") &&
    STORAGE_AREA_NAMES.has(value.name.text)
  ) {
    return value.name.text;
  }
  return null;
}

function callName(expression: ts.Expression): string | null {
  const value = unwrap(expression);
  if (ts.isIdentifier(value)) return value.text;
  if (ts.isPropertyAccessExpression(value)) return value.name.text;
  return null;
}

function isProvablyUserScoped(argument: ts.Expression): boolean {
  // Dynamic values can be user-scoped, but this scan cannot prove most of
  // them. It reports those values as UNRESOLVED and checks obvious user names.
  let userScoped = false;
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      userScoped ||= USER_SCOPED_IDENTIFIERS.has(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(argument);
  return userScoped;
}

function scanStorageWrites(): StorageFinding[] {
  const files = SOURCE_ROOTS.flatMap((root) => sourceFiles(resolve(root))).map((file) => ({
    file,
    source: readFileSync(file, "utf8"),
  }));
  const sourceFilesByPath = files.map(({ file, source }) =>
    ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKindFor(file)),
  );
  const declarations = collectConstantDeclarations(sourceFilesByPath);
  const findings: StorageFinding[] = [];

  for (const sourceFile of sourceFilesByPath) {
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const expression = unwrap(node.expression);
        const isPersistedStateCall = callName(expression) === "usePersistedState";
        const isStorageSetItem =
          ts.isPropertyAccessExpression(expression) &&
          expression.name.text === "setItem" &&
          storageArea(expression.expression) !== null;

        if ((isPersistedStateCall || isStorageSetItem) && node.arguments.length > 0) {
          const keyArgument = node.arguments[0];
          const resolved = resolveStaticValue(keyArgument, declarations);
          const key = resolved?.value ?? "UNRESOLVED";
          findings.push({
            file: sourceFile.fileName,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
            key,
            operation: isPersistedStateCall ? "usePersistedState" : "setItem",
            userScoped: resolved === null && isProvablyUserScoped(keyArgument),
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }

  return findings;
}

function isAccountedFor(
  finding: StorageFinding,
  legacyKeys: ReadonlySet<string>,
  retainedKeys: ReadonlySet<string>,
): boolean {
  if (finding.key === "UNRESOLVED") return !finding.userScoped;
  return (
    USER_SCOPED_KEY_SET.has(finding.key) ||
    finding.key.startsWith(STORAGE_PREFIX) ||
    legacyKeys.has(finding.key) ||
    retainedKeys.has(finding.key)
  );
}

describe("client storage key completeness", () => {
  it("finds persisted-state wrapper keys and resolves their constants", () => {
    const wrapperKeys = scanStorageWrites()
      .filter((finding) => finding.operation === "usePersistedState")
      .map((finding) => finding.key);

    expect(wrapperKeys).toEqual(
      expect.arrayContaining([
        "vc_selected_brand_id",
        "vc_visibility_engine",
        "vc_citations_tab",
        "vc_keywords_filter",
      ]),
    );
  });

  it("accounts for every storage write in client source", () => {
    const files = SOURCE_ROOTS.flatMap((root) => sourceFiles(resolve(root))).map((file) =>
      ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        scriptKindFor(file),
      ),
    );
    const declarations = collectConstantDeclarations(files);
    const legacyKeys = new Set(resolveStringList("LEGACY_UNPREFIXED_KEYS", declarations));
    const retainedKeys = new Set(resolveStringList("RETAINED_DEVICE_STORAGE_KEYS", declarations));
    const findings = scanStorageWrites();
    const violations = findings.filter(
      (finding) => !isAccountedFor(finding, legacyKeys, retainedKeys),
    );
    const unresolved = findings.filter((finding) => finding.key === "UNRESOLVED");

    const diagnostics = [...violations, ...unresolved].map(
      (finding) => `${relative(process.cwd(), finding.file)}:${finding.line} ${finding.key}`,
    );
    expect(violations, diagnostics.join("\n")).toEqual([]);
  });
});
