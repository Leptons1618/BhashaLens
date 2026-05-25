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

export async function seedDictionary(): Promise<{ count: number }> {
  const context = createDbContext();
  const rows = await loadEntries();

  context.db.delete(dictionaryEntries).where(eq(dictionaryEntries.lang, "bn")).run();

  if (rows.length > 0) {
    context.db.insert(dictionaryEntries).values(rows).run();
  }

  context.sqlite.close();
  return { count: rows.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await seedDictionary();
  console.log(`Seeded ${result.count} Bengali dictionary entries.`);
}
