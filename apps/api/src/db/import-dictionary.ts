import { BengaliAdapter, type DictionaryEntry } from "@bhashalens/core";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { createDbContext } from "./client.js";

type ImportFormat = "json" | "jsonl" | "tsv";

interface ImportOptions {
  filePath: string;
  format?: ImportFormat;
  limit?: number;
  replace?: boolean;
  source?: string;
}

interface WiktextractSense {
  glosses?: string[];
  raw_glosses?: string[];
  synonyms?: Array<{ word?: string }>;
}

interface WiktextractSound {
  ipa?: string;
  roman?: string;
  tags?: string[];
}

interface WiktextractEntry {
  lang?: string;
  lang_code?: string;
  pos?: string;
  senses?: WiktextractSense[];
  sounds?: WiktextractSound[];
  word?: string;
}

const adapter = new BengaliAdapter();

function parseArgs(argv: string[]): ImportOptions {
  const [filePath, ...flags] = argv;
  if (!filePath) {
    throw new Error("Usage: pnpm --filter @bhashalens/api import:dictionary -- <file> [--replace] [--source name] [--format json|jsonl|tsv] [--limit n]");
  }

  const options: ImportOptions = {
    filePath: resolve(process.cwd(), filePath)
  };

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--replace") {
      options.replace = true;
    } else if (flag === "--source") {
      options.source = flags[index + 1];
      index += 1;
    } else if (flag === "--format") {
      options.format = flags[index + 1] as ImportFormat;
      index += 1;
    } else if (flag === "--limit") {
      options.limit = Number.parseInt(flags[index + 1] ?? "", 10);
      index += 1;
    }
  }

  return options;
}

function detectFormat(filePath: string, explicit?: ImportFormat): ImportFormat {
  if (explicit) {
    return explicit;
  }

  const extension = extname(filePath).toLowerCase();
  if (extension === ".jsonl" || extension === ".ndjson") {
    return "jsonl";
  }

  if (extension === ".tsv") {
    return "tsv";
  }

  return "json";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.map(readString).filter((item): item is string => Boolean(item));
  return values.length > 0 ? values : undefined;
}

function normalizeEntry(entry: Partial<DictionaryEntry>, source: string): DictionaryEntry | null {
  const word = readString(entry.word);
  const definition = readString(entry.definition);
  if (!word || !definition || !adapter.detect(word)) {
    return null;
  }

  const normalized = adapter.normalize(readString(entry.normalized) ?? word);
  if (!adapter.detect(normalized)) {
    return null;
  }

  return {
    definition,
    examples: readStringArray(entry.examples),
    lang: "bn",
    normalized,
    partOfSpeech: readString(entry.partOfSpeech) ?? "unknown",
    source: readString(entry.source) ?? source,
    synonyms: readStringArray(entry.synonyms),
    transliteration: readString(entry.transliteration) ?? "",
    word
  };
}

function fromWiktextract(raw: WiktextractEntry, source: string): DictionaryEntry[] {
  if (!raw.word || raw.lang_code !== "bn") {
    return [];
  }

  const transliteration = raw.sounds?.find((sound) => sound.roman)?.roman ?? raw.sounds?.find((sound) => sound.ipa)?.ipa ?? "";
  const entries: DictionaryEntry[] = [];

  for (const sense of raw.senses ?? []) {
    const definition = sense.glosses?.[0] ?? sense.raw_glosses?.[0];
    const synonyms = sense.synonyms?.map((synonym) => synonym.word).filter((word): word is string => Boolean(word));
    const entry = normalizeEntry(
      {
        definition,
        partOfSpeech: raw.pos ?? "unknown",
        source,
        synonyms,
        transliteration,
        word: raw.word
      },
      source
    );

    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function fromRecord(raw: unknown, source: string): DictionaryEntry[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }

  const record = raw as Record<string, unknown>;
  if (record.lang_code === "bn" && Array.isArray(record.senses)) {
    return fromWiktextract(record as WiktextractEntry, source);
  }

  const entry = normalizeEntry(
    {
      definition: readString(record.definition) ?? readString(record.meaning),
      examples: readStringArray(record.examples),
      normalized: readString(record.normalized),
      partOfSpeech: readString(record.partOfSpeech) ?? readString(record.pos),
      source: readString(record.source),
      synonyms: readStringArray(record.synonyms),
      transliteration: readString(record.transliteration) ?? readString(record.romanization),
      word: readString(record.word) ?? readString(record.headword)
    },
    source
  );

  return entry ? [entry] : [];
}

function parseTsvLine(line: string): string[] {
  return line.split("\t").map((cell) => cell.trim());
}

async function loadJsonEntries(filePath: string, source: string): Promise<DictionaryEntry[]> {
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    return fromRecord(parsed, source);
  }

  return parsed.flatMap((record) => fromRecord(record, source));
}

async function loadJsonlEntries(filePath: string, source: string, limit?: number): Promise<DictionaryEntry[]> {
  const stream = createReadStream(filePath, "utf8");
  const lines = createInterface({ crlfDelay: Number.POSITIVE_INFINITY, input: stream });
  const entries: DictionaryEntry[] = [];

  for await (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    entries.push(...fromRecord(JSON.parse(line), source));

    if (limit && entries.length >= limit) {
      break;
    }
  }

  return limit ? entries.slice(0, limit) : entries;
}

async function loadTsvEntries(filePath: string, source: string): Promise<DictionaryEntry[]> {
  const lines = (await readFile(filePath, "utf8")).split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }

  const headers = parseTsvLine(lines[0]!);
  return lines.slice(1).flatMap((line) => {
    const cells = parseTsvLine(line);
    const record = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    return fromRecord(record, source);
  });
}

async function loadEntries(options: ImportOptions): Promise<DictionaryEntry[]> {
  const source = options.source ?? "import";
  const format = detectFormat(options.filePath, options.format);

  if (format === "jsonl") {
    return loadJsonlEntries(options.filePath, source, options.limit);
  }

  if (format === "tsv") {
    const entries = await loadTsvEntries(options.filePath, source);
    return options.limit ? entries.slice(0, options.limit) : entries;
  }

  const entries = await loadJsonEntries(options.filePath, source);
  return options.limit ? entries.slice(0, options.limit) : entries;
}

export async function importDictionaryFile(options: ImportOptions): Promise<{ inserted: number; parsed: number }> {
  const entries = await loadEntries(options);
  const context = createDbContext();

  if (options.replace) {
    context.sqlite.prepare("DELETE FROM dictionary_entries WHERE lang = ?").run("bn");
  }

  const insert = context.sqlite.prepare(`
    INSERT OR IGNORE INTO dictionary_entries (
      lang,
      word,
      normalized,
      transliteration,
      part_of_speech,
      definition,
      source,
      synonyms,
      examples
    )
    VALUES (
      @lang,
      @word,
      @normalized,
      @transliteration,
      @partOfSpeech,
      @definition,
      @source,
      @synonyms,
      @examples
    )
  `);

  const writeMany = context.sqlite.transaction((rows: DictionaryEntry[]) => {
    let inserted = 0;
    for (const row of rows) {
      const result = insert.run({
        ...row,
        examples: row.examples ? JSON.stringify(row.examples) : null,
        synonyms: row.synonyms ? JSON.stringify(row.synonyms) : null
      });
      inserted += result.changes;
    }
    return inserted;
  });

  const inserted = writeMany(entries);
  context.sqlite.close();
  return { inserted, parsed: entries.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await importDictionaryFile(parseArgs(process.argv.slice(2)));
  console.log(`Imported ${result.inserted} entries (${result.parsed} parsed).`);
}
