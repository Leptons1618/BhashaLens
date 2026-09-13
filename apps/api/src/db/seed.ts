import { BengaliAdapter } from "@bhashalens/core";
import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDbContext } from "./client.js";
import { dictionaryEntries, type DictionaryEntryInsert } from "./schema.js";

interface SeedEntry {
  definition: string;
  examples?: string[];
  partOfSpeech: string;
  source?: string;
  synonyms?: string[];
  transliteration: string;
  word: string;
}

const adapter = new BengaliAdapter();

function workspaceRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return resolve(dirname(currentFile), "../../../..");
}

function dictionaryFile(): string {
  return process.env.BN_DICTIONARY_FILE ?? resolve(workspaceRoot(), "data/bn-dictionary/entries.json");
}

function toInsert(entry: SeedEntry): DictionaryEntryInsert {
  const normalized = adapter.normalize(entry.word);

  return {
    definition: entry.definition,
    examples: entry.examples ?? null,
    lang: "bn",
    normalized,
    partOfSpeech: entry.partOfSpeech,
    source: entry.source ?? "seed",
    synonyms: entry.synonyms ?? null,
    transliteration: entry.transliteration,
    word: entry.word
  };
}

async function loadEntries(): Promise<DictionaryEntryInsert[]> {
  const raw = await readFile(dictionaryFile(), "utf8");
  const parsed = JSON.parse(raw) as SeedEntry[];

  return parsed.map(toInsert).filter((entry) => adapter.detect(entry.normalized));
}

export interface SeedOptions {
  /** Clear all Bengali entries first (used by `seed:all`, not by plain `seed`). */
  replace?: boolean;
}

export async function seedDictionary(options: SeedOptions = {}): Promise<{ count: number }> {
  const context = createDbContext();
  const rows = await loadEntries();

  if (options.replace) {
    context.db.delete(dictionaryEntries).where(eq(dictionaryEntries.lang, "bn")).run();
  }

  if (rows.length > 0) {
    // Plain `seed` is additive so it cannot wipe imported bulk data by accident;
    // `seed:all` opts into the full reset.
    context.db.insert(dictionaryEntries).values(rows).onConflictDoNothing().run();
  }

  context.sqlite.close();
  return { count: rows.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await seedDictionary({ replace: process.argv.includes("--replace") });
  console.log(`Seeded ${result.count} Bengali dictionary entries.`);
}
