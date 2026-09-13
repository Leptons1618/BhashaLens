/**
 * Missing-entry report.
 *
 * Answers "which common words would a user look up and get nothing?", by
 * replaying the API's resolution order in memory: exact dictionary entry →
 * Wiktionary form mapping → morphology candidates. Words that fail all three
 * are reported, ranked by corpus frequency, so dictionary work can target the
 * biggest gaps first.
 *
 *   pnpm --filter @bhashalens/api report:missing
 *   pnpm --filter @bhashalens/api report:missing -- --limit 50000 --min-count 5
 */
import { BengaliAdapter, type LanguageAdapter } from "@bhashalens/core";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDbContext, type DbContext } from "./client.js";

export interface FrequencyWord {
  count: number;
  normalized: string;
  rank: number;
  word: string;
}

export interface MissingEntry extends FrequencyWord {
  candidates: string[];
}

export interface CoverageIndex {
  dictionary: Set<string>;
  forms: Map<string, string[]>;
}

export function buildCoverageIndex(context: DbContext, lang = "bn"): CoverageIndex {
  const dictionary = new Set<string>();
  const dictionaryRows = context.sqlite
    .prepare("SELECT DISTINCT normalized FROM dictionary_entries WHERE lang = ?")
    .all(lang) as Array<{ normalized: string }>;
  for (const row of dictionaryRows) {
    dictionary.add(row.normalized);
  }

  const forms = new Map<string, string[]>();
  const formRows = context.sqlite
    .prepare("SELECT normalized, lemma FROM word_forms WHERE lang = ?")
    .all(lang) as Array<{ normalized: string; lemma: string }>;
  for (const row of formRows) {
    const lemmas = forms.get(row.normalized);
    if (lemmas) {
      lemmas.push(row.lemma);
    } else {
      forms.set(row.normalized, [row.lemma]);
    }
  }

  return { dictionary, forms };
}

function resolvesToEntry(normalized: string, index: CoverageIndex): boolean {
  if (index.dictionary.has(normalized)) {
    return true;
  }

  const lemmas = index.forms.get(normalized);
  return Boolean(lemmas?.some((lemma) => index.dictionary.has(lemma)));
}

/** True when the word resolves via an entry, a form→lemma mapping, or morphology. */
export function classifyWord(
  word: string,
  index: CoverageIndex,
  adapter: LanguageAdapter
): { candidates: string[]; covered: boolean } {
  const normalized = adapter.normalize(word);
  const candidates = adapter.analyzeMorphology?.(normalized)?.candidates ?? [];
  const covered =
    resolvesToEntry(normalized, index) ||
    candidates.some((candidate) => candidate.normalized !== normalized && resolvesToEntry(candidate.normalized, index));

  return {
    candidates: candidates.map((candidate) => candidate.normalized),
    covered
  };
}

export function findMissingEntries(
  words: FrequencyWord[],
  index: CoverageIndex,
  adapter: LanguageAdapter
): MissingEntry[] {
  const missing: MissingEntry[] = [];

  for (const row of words) {
    const { candidates, covered } = classifyWord(row.normalized, index, adapter);
    if (!covered) {
      missing.push({ ...row, candidates });
    }
  }

  return missing;
}

interface ReportOptions {
  limit: number;
  minCount: number;
  output: string;
}

function parseArgs(argv: string[]): ReportOptions {
  const options: ReportOptions = {
    limit: 20_000,
    minCount: 2,
    output: resolve(process.cwd(), "../../downloads/bn-missing-entries.tsv")
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--limit") {
      options.limit = Number.parseInt(argv[index + 1] ?? "", 10) || options.limit;
      index += 1;
    } else if (flag === "--min-count") {
      options.minCount = Number.parseInt(argv[index + 1] ?? "", 10) || options.minCount;
      index += 1;
    } else if (flag === "--output") {
      options.output = resolve(process.cwd(), argv[index + 1] ?? options.output);
      index += 1;
    }
  }

  return options;
}

function formatReport(missing: MissingEntry[], scanned: number, top: number): string {
  const lines = [
    `Scanned ${scanned.toLocaleString("en-US")} frequency-ranked words`,
    `Missing coverage: ${missing.length.toLocaleString("en-US")} (${((missing.length / Math.max(scanned, 1)) * 100).toFixed(1)}%)`,
    "",
    `Top ${Math.min(top, missing.length)} gaps:`
  ];

  for (const row of missing.slice(0, top)) {
    lines.push(`  ${String(row.rank).padStart(7)}  ${row.word}  (${row.count})`);
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const context = createDbContext();
  const adapter = new BengaliAdapter();
  const index = buildCoverageIndex(context);

  const words = context.sqlite
    .prepare(
      `SELECT rank, word, normalized, count
       FROM word_frequencies
       WHERE lang = ? AND count >= ?
       ORDER BY rank
       LIMIT ?`
    )
    .all("bn", options.minCount, options.limit) as FrequencyWord[];

  const missing = findMissingEntries(words, index, adapter);
  context.sqlite.close();

  mkdirSync(dirname(options.output), { recursive: true });
  const header = [
    `# source\tbnwiki (frequency) vs dictionary coverage`,
    `# generated-at\t${new Date().toISOString()}`,
    `# scanned\t${words.length}`,
    `# missing\t${missing.length}`,
    "# rank\tword\tcount\tcandidates"
  ].join("\n");
  const rows = missing.map((row) => `${row.rank}\t${row.word}\t${row.count}\t${row.candidates.join(", ")}`).join("\n");
  writeFileSync(options.output, `${header}\n${rows}${rows.length > 0 ? "\n" : ""}`, "utf8");

  console.log(formatReport(missing, words.length, 25));
  console.log(`\nFull report: ${options.output}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
