import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const dictionaryEntries = sqliteTable(
  "dictionary_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    lang: text("lang").notNull(),
    word: text("word").notNull(),
    normalized: text("normalized").notNull(),
    transliteration: text("transliteration").notNull(),
    ipa: text("ipa"),
    partOfSpeech: text("part_of_speech").notNull(),
    definition: text("definition").notNull(),
    source: text("source"),
    synonyms: text("synonyms", { mode: "json" }).$type<string[]>(),
    examples: text("examples", { mode: "json" }).$type<string[]>(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`)
  },
  (table) => ({
    lookupIdx: index("dictionary_entries_lookup_idx").on(table.lang, table.normalized),
    uniqueEntryIdx: uniqueIndex("dictionary_entries_unique_idx").on(
      table.lang,
      table.normalized,
      table.partOfSpeech,
      table.definition
    )
  })
);

export type DictionaryEntryInsert = typeof dictionaryEntries.$inferInsert;
export type DictionaryEntryRow = typeof dictionaryEntries.$inferSelect;

/**
 * Word frequency list derived from an open Bengali corpus (currently the
 * Bengali Wikipedia dump, CC BY-SA 4.0). Kept separate from dictionary content:
 * frequencies rank existing entries and morphological candidates, they are not
 * dictionary data themselves. Regenerate with
 * `pnpm --filter @bhashalens/api build:frequencies` + `import:frequencies`.
 */
export const wordFrequencies = sqliteTable(
  "word_frequencies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    lang: text("lang").notNull(),
    word: text("word").notNull(),
    normalized: text("normalized").notNull(),
    count: integer("count").notNull(),
    rank: integer("rank").notNull(),
    source: text("source").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`)
  },
  (table) => ({
    frequencyIdx: uniqueIndex("word_frequencies_unique_idx").on(table.lang, table.normalized),
    rankIdx: index("word_frequencies_rank_idx").on(table.lang, table.rank)
  })
);

export type WordFrequencyInsert = typeof wordFrequencies.$inferInsert;
export type WordFrequencyRow = typeof wordFrequencies.$inferSelect;

/**
 * Inflected form → lemma mappings mined from Wiktionary (Kaikki `forms[]`).
 * Morphology rules cover regular inflection; this table covers what rules
 * cannot derive, e.g. গেলাম → যাওয়া. Kept separate from `dictionary_entries`
 * so a form is never mistaken for a headword. `tags` carries the grammatical
 * labels (["first-person", "past", ...]) for display.
 */
export const wordForms = sqliteTable(
  "word_forms",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    lang: text("lang").notNull(),
    form: text("form").notNull(),
    normalized: text("normalized").notNull(),
    lemma: text("lemma").notNull(),
    lemmaWord: text("lemma_word").notNull(),
    tags: text("tags", { mode: "json" }).$type<string[]>(),
    source: text("source").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`)
  },
  (table) => ({
    lookupIdx: index("word_forms_lookup_idx").on(table.lang, table.normalized),
    uniqueFormIdx: uniqueIndex("word_forms_unique_idx").on(table.lang, table.normalized, table.lemma)
  })
);

export type WordFormInsert = typeof wordForms.$inferInsert;
export type WordFormRow = typeof wordForms.$inferSelect;

/**
 * Provenance for each bulk import run: which source, when, under what license,
 * and how many entries it contributed. Lets the app surface attribution and
 * lets operators audit where definitions came from.
 */
export const dictionarySources = sqliteTable("dictionary_sources", {
  key: text("key").primaryKey(),
  title: text("title").notNull(),
  homepage: text("homepage"),
  license: text("license"),
  licenseUrl: text("license_url"),
  attribution: text("attribution"),
  entryCount: integer("entry_count").notNull().default(0),
  importedAt: integer("imported_at").notNull().default(sql`(unixepoch())`)
});

export type DictionarySourceInsert = typeof dictionarySources.$inferInsert;
export type DictionarySourceRow = typeof dictionarySources.$inferSelect;

/**
 * Cache of machine-translation fallbacks used when no curated/Wiktionary entry
 * exists. Kept in its OWN table (never merged into `dictionary_entries`) so
 * machine output is reusable but can never be mistaken for vetted dictionary
 * data. Surfaced in the UI with an explicit "machine translation" label.
 */
export const translationCache = sqliteTable(
  "translation_cache",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    lang: text("lang").notNull(),
    normalized: text("normalized").notNull(),
    targetLang: text("target_lang").notNull(),
    word: text("word").notNull(),
    translation: text("translation").notNull(),
    provider: text("provider").notNull().default("google-translate"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`)
  },
  (table) => ({
    uniqueTranslationIdx: uniqueIndex("translation_cache_unique_idx").on(
      table.lang,
      table.normalized,
      table.targetLang
    )
  })
);

export type TranslationCacheInsert = typeof translationCache.$inferInsert;
export type TranslationCacheRow = typeof translationCache.$inferSelect;
