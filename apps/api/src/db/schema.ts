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
