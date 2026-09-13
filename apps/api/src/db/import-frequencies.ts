/**
 * Import a Bengali word-frequency TSV into the `word_frequencies` table.
 *
 *   pnpm --filter @bhashalens/api import:frequencies ../../downloads/bn-frequencies.tsv --source bnwiki
 *
 * The TSV is `word<TAB>count`, one word per line, ranked by line order. Lines
 * starting with "#" are provenance headers written by
 * `scripts/build-frequencies.py` and are ignored. Idempotent: re-importing
 * replaces counts and ranks for the same normalized word.
 */
import { normalizeBengali } from "@bhashalens/core";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createDbContext, type DbContext } from "./client.js";
import { SOURCE_REGISTRY } from "./sources.js";

interface ImportFrequencyOptions {
  filePath: string;
  lang: string;
  limit?: number;
  source: string;
}

interface FrequencyRow {
  count: number;
  word: string;
}

const BATCH_SIZE = 5000;

async function* readFrequencyRows(filePath: string): AsyncGenerator<FrequencyRow> {
  const reader = createInterface({ crlfDelay: Infinity, input: createReadStream(filePath, "utf8") });

  for await (const line of reader) {
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const tab = line.lastIndexOf("\t");
    if (tab <= 0) {
      continue;
    }

    const word = line.slice(0, tab).trim();
    const count = Number.parseInt(line.slice(tab + 1).trim(), 10);
    if (word.length === 0 || !Number.isFinite(count) || count <= 0) {
      continue;
    }

    yield { count, word };
  }
}

function prepareInsert(context: DbContext) {
  return context.sqlite.prepare(`
    INSERT INTO word_frequencies (lang, word, normalized, count, rank, source)
    VALUES (@lang, @word, @normalized, @count, @rank, @source)
    ON CONFLICT(lang, normalized) DO UPDATE SET
      word = excluded.word,
      count = excluded.count,
      rank = excluded.rank,
      source = excluded.source,
      created_at = unixepoch()
  `);
}

export async function importFrequencyFile(options: ImportFrequencyOptions): Promise<{ imported: number; parsed: number }> {
  const context = createDbContext();
  const insert = prepareInsert(context);
  const batch: Array<FrequencyRow & { normalized: string; rank: number }> = [];
  let imported = 0;
  let parsed = 0;

  const flush = context.sqlite.transaction((rows: typeof batch) => {
    for (const row of rows) {
      insert.run({ ...row, lang: options.lang, source: options.source });
    }
    return rows.length;
  });

  for await (const row of readFrequencyRows(options.filePath)) {
    if (options.limit && parsed >= options.limit) {
      break;
    }

    const normalized = normalizeBengali(row.word);
    if (normalized.length === 0) {
      continue;
    }

    parsed += 1;
    batch.push({ ...row, normalized, rank: parsed });
    if (batch.length >= BATCH_SIZE) {
      imported += flush(batch.splice(0, batch.length));
    }
  }

  if (batch.length > 0) {
    imported += flush(batch);
  }

  context.sqlite.close();
  return { imported, parsed };
}

function parseArgs(argv: string[]): ImportFrequencyOptions {
  const [filePath, ...flags] = argv;
  if (!filePath) {
    throw new Error(
      "Usage: pnpm --filter @bhashalens/api import:frequencies <file.tsv> [--source name] [--lang bn] [--limit n]"
    );
  }

  const options: ImportFrequencyOptions = {
    filePath: resolve(process.cwd(), filePath),
    lang: "bn",
    source: "bnwiki"
  };

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === "--source") {
      options.source = flags[index + 1] ?? options.source;
      index += 1;
    } else if (flag === "--lang") {
      options.lang = flags[index + 1] ?? options.lang;
      index += 1;
    } else if (flag === "--limit") {
      options.limit = Number.parseInt(flags[index + 1] ?? "", 10);
      index += 1;
    }
  }

  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const result = await importFrequencyFile(options);
  const source = SOURCE_REGISTRY[options.source];
  console.log(
    `Imported ${result.imported} frequency rows (${result.parsed} parsed) from ${source?.title ?? options.source}.`
  );
}
