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
