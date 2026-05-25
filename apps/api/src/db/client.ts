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

export function ensureSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS dictionary_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang TEXT NOT NULL,
      word TEXT NOT NULL,
      normalized TEXT NOT NULL,
      transliteration TEXT NOT NULL,
      part_of_speech TEXT NOT NULL,
      definition TEXT NOT NULL,
      source TEXT,
      synonyms TEXT,
      examples TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS dictionary_entries_lookup_idx
      ON dictionary_entries(lang, normalized);

    CREATE UNIQUE INDEX IF NOT EXISTS dictionary_entries_unique_idx
      ON dictionary_entries(lang, normalized, part_of_speech, definition);
  `);
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
