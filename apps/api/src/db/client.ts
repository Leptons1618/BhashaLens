import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema.js";

export interface DbContext {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: Database.Database;
}

export function resolveDatabaseFile(databaseFile = process.env.DATABASE_FILE ?? ".data/bhashalens.sqlite"): string {
  if (databaseFile === ":memory:") {
    return databaseFile;
  }

  return resolve(process.cwd(), databaseFile);
}

function ensureColumn(sqlite: Database.Database, table: string, column: string, definition: string): void {
  const existing = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!existing.some((col) => col.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function ensureSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS dictionary_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang TEXT NOT NULL,
      word TEXT NOT NULL,
      normalized TEXT NOT NULL,
      transliteration TEXT NOT NULL,
      ipa TEXT,
      part_of_speech TEXT NOT NULL,
      definition TEXT NOT NULL,
      source TEXT,
      synonyms TEXT,
      examples TEXT,
      review_status TEXT NOT NULL DEFAULT 'unreviewed',
      review_note TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS dictionary_entries_lookup_idx
      ON dictionary_entries(lang, normalized);

    CREATE UNIQUE INDEX IF NOT EXISTS dictionary_entries_unique_idx
      ON dictionary_entries(lang, normalized, part_of_speech, definition);

    CREATE TABLE IF NOT EXISTS dictionary_sources (
      key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      homepage TEXT,
      license TEXT,
      license_url TEXT,
      attribution TEXT,
      entry_count INTEGER NOT NULL DEFAULT 0,
      imported_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS translation_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang TEXT NOT NULL,
      normalized TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      word TEXT NOT NULL,
      translation TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'google-translate',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE UNIQUE INDEX IF NOT EXISTS translation_cache_unique_idx
      ON translation_cache(lang, normalized, target_lang);

    CREATE TABLE IF NOT EXISTS word_frequencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang TEXT NOT NULL,
      word TEXT NOT NULL,
      normalized TEXT NOT NULL,
      count INTEGER NOT NULL,
      rank INTEGER NOT NULL,
      source TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE UNIQUE INDEX IF NOT EXISTS word_frequencies_unique_idx
      ON word_frequencies(lang, normalized);

    CREATE INDEX IF NOT EXISTS word_frequencies_rank_idx
      ON word_frequencies(lang, rank);

    CREATE TABLE IF NOT EXISTS word_forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang TEXT NOT NULL,
      form TEXT NOT NULL,
      normalized TEXT NOT NULL,
      lemma TEXT NOT NULL,
      lemma_word TEXT NOT NULL,
      tags TEXT,
      source TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS word_forms_lookup_idx
      ON word_forms(lang, normalized);

    CREATE UNIQUE INDEX IF NOT EXISTS word_forms_unique_idx
      ON word_forms(lang, normalized, lemma);
  `);

  // Idempotent migration for databases created before the ipa column existed.
  ensureColumn(sqlite, "dictionary_entries", "ipa", "TEXT");
  // Review queue columns (added with the low-confidence scanner).
  ensureColumn(sqlite, "dictionary_entries", "review_status", "TEXT NOT NULL DEFAULT 'unreviewed'");
  ensureColumn(sqlite, "dictionary_entries", "review_note", "TEXT");
}

export function createDbContext(databaseFile?: string): DbContext {
  const resolved = resolveDatabaseFile(databaseFile);
  if (resolved !== ":memory:") {
    mkdirSync(dirname(resolved), { recursive: true });
  }

  const sqlite = new Database(resolved);
  if (resolved !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = NORMAL");
  }

  ensureSchema(sqlite);
  return {
    db: drizzle(sqlite, { schema }),
    sqlite
  };
}

export function closeDbContext(context: DbContext): void {
  context.sqlite.close();
}
