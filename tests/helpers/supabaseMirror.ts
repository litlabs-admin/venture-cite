import fs from "node:fs";
import path from "node:path";

/**
 * Resolve a generated Supabase mirror file from its ROOT migration filename.
 *
 * Tests must never hardcode a mirror filename. The `20260421NNNNNN_` prefix is a
 * generated artifact of `scripts/syncSupabaseMigrations.mjs`, and it is derived
 * from sorted ordinal position rather than from the four digits in the root
 * filename - because root migration numbers are not unique (0094-0100 each carry
 * two files). Inserting or renaming any migration shifts every later ordinal.
 *
 * Twelve tests previously hardcoded these prefixes and broke as a set the first
 * time the versioning scheme changed. Resolving by root filename keeps them
 * coupled to the thing they actually assert about - the migration's content -
 * and decoupled from how the mirror happens to be numbered today.
 */
export function supabaseMirrorPath(rootFileName: string): string {
  const mirrorDirectory = path.resolve(process.cwd(), "supabase", "migrations");
  const suffix = `_${rootFileName}`;
  const matches = fs
    .readdirSync(mirrorDirectory)
    .filter((name) => name.endsWith(suffix))
    .sort();

  if (matches.length === 0) {
    throw new Error(
      `No Supabase mirror file for ${rootFileName}. ` +
        `Run \`npm run supabase:migrations:sync\` to regenerate supabase/migrations/.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous Supabase mirror for ${rootFileName}: ${matches.join(", ")}. ` +
        `Each root migration must map to exactly one mirror file.`,
    );
  }

  return path.join(mirrorDirectory, matches[0]);
}

/** Read a generated Supabase mirror file, resolved by its root migration filename. */
export function readSupabaseMirror(rootFileName: string): string {
  return fs.readFileSync(supabaseMirrorPath(rootFileName), "utf8");
}

/** Read a root migration file from `migrations/`. */
export function readRootMigration(rootFileName: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), "migrations", rootFileName), "utf8");
}
