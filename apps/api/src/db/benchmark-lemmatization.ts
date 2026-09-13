/**
 * Lemmatization benchmark.
 *
 * The `word_forms` table is gold data mined from Wiktionary: inflected form →
 * lemma. To estimate what the *rules alone* can do (and therefore how much
 * headroom a POS-aware model would have), this replays every form through the
 * morphology analyzer with the form table hidden and checks whether the
 * expected lemma appears among the candidates.
 *
 *   pnpm --filter @bhashalens/api benchmark:lemmas
 *   pnpm --filter @bhashalens/api benchmark:lemmas -- --limit 5000
 *
 * Forms that are themselves dictionary headwords are counted separately: an
 * exact lookup already resolves those, so they are not a lemmatization gap.
 */
import { BengaliAdapter, type LanguageAdapter } from "@bhashalens/core";
import { fileURLToPath } from "node:url";
import { createDbContext } from "./client.js";

export interface BenchmarkForm {
  form: string;
  lemma: string;
  tags: string[];
}

export interface GroupStats {
  exactHeadword: number;
  lemmaAny: number;
  lemmaAnyScorable: number;
  lemmaTop1: number;
  lemmaTop1Scorable: number;
  scorable: number;
  total: number;
}

export interface BenchmarkResult {
  byGroup: Record<string, GroupStats>;
  failures: Array<{ candidates: string[]; form: string; lemma: string }>;
  overall: GroupStats;
}

const VERB_TAGS = new Set([
  "causative",
  "conditional",
  "continuative",
  "first-person",
  "future",
  "habitual",
  "imperative",
  "infinitive",
  "participle",
  "past",
  "perfect",
  "present",
  "second-person",
  "third-person"
]);

export function groupFor(tags: string[]): "verb" | "nominal" {
  return tags.some((tag) => VERB_TAGS.has(tag)) ? "verb" : "nominal";
}

function emptyStats(): GroupStats {
  return { exactHeadword: 0, lemmaAny: 0, lemmaAnyScorable: 0, lemmaTop1: 0, lemmaTop1Scorable: 0, scorable: 0, total: 0 };
}

export function benchmarkForms(
  forms: BenchmarkForm[],
  dictionary: Set<string>,
  adapter: LanguageAdapter
): BenchmarkResult {
  const byGroup: Record<string, GroupStats> = { nominal: emptyStats(), verb: emptyStats() };
  const overall = emptyStats();
  const failures: BenchmarkResult["failures"] = [];

  for (const row of forms) {
    const candidates = adapter.analyzeMorphology?.(adapter.normalize(row.form))?.candidates ?? [];
    const normalizedForm = adapter.normalize(row.form);
    const normalized = candidates.map((candidate) => candidate.normalized);
    const exactHeadword = dictionary.has(normalizedForm);
    // Rank metric: the best candidate that is not the surface itself (the
    // surface always ranks first, so it says nothing about lemmatization).
    const bestNonSurface = normalized.find((candidate) => candidate !== normalizedForm);
    const lemmaTop1 = bestNonSurface === row.lemma;
    const lemmaAny = normalized.includes(row.lemma);
    const scorable = !exactHeadword;

    const group = byGroup[groupFor(row.tags)]!;
    for (const stats of [overall, group]) {
      stats.total += 1;
      stats.exactHeadword += exactHeadword ? 1 : 0;
      stats.lemmaTop1 += lemmaTop1 ? 1 : 0;
      stats.lemmaAny += lemmaAny ? 1 : 0;
      stats.scorable += scorable ? 1 : 0;
      stats.lemmaTop1Scorable += scorable && lemmaTop1 ? 1 : 0;
      stats.lemmaAnyScorable += scorable && lemmaAny ? 1 : 0;
    }

    if (scorable && !lemmaAny && failures.length < 15) {
      failures.push({ candidates: normalized.slice(0, 4), form: row.form, lemma: row.lemma });
    }
  }

  return { byGroup, failures, overall };
}

function percent(value: number, total: number): string {
  return total === 0 ? "—" : `${((value / total) * 100).toFixed(1)}%`;
}

function main(): void {
  const limitIndex = process.argv.indexOf("--limit");
  const limit = limitIndex === -1 ? 0 : Number.parseInt(process.argv[limitIndex + 1] ?? "", 10) || 0;

  const context = createDbContext();
  const dictionary = new Set(
    (context.sqlite.prepare("SELECT DISTINCT normalized FROM dictionary_entries WHERE lang = 'bn'").all() as Array<{
      normalized: string;
    }>).map((row) => row.normalized)
  );

  const query = `SELECT form, lemma, tags FROM word_forms WHERE lang = 'bn' ORDER BY id${limit > 0 ? " LIMIT ?" : ""}`;
  const rows = (limit > 0 ? context.sqlite.prepare(query).all(limit) : context.sqlite.prepare(query).all()) as Array<{
    form: string;
    lemma: string;
    tags: string;
  }>;
  context.sqlite.close();

  const forms: BenchmarkForm[] = rows.map((row) => ({
    form: row.form,
    lemma: row.lemma,
    tags: (JSON.parse(row.tags || "[]") as string[]) ?? []
  }));

  const adapter = new BengaliAdapter();
  const result = benchmarkForms(forms, dictionary, adapter);

  console.log(`Evaluated ${result.overall.total.toLocaleString("en-US")} Wiktionary form→lemma pairs (form table hidden).`);
  console.log(`  exact dictionary headword (lookup already resolves): ${result.overall.exactHeadword.toLocaleString("en-US")}`);
  console.log(`  rules find the lemma anywhere:  ${percent(result.overall.lemmaAny, result.overall.total)}`);
  console.log(`  rules put the lemma first:      ${percent(result.overall.lemmaTop1, result.overall.total)}`);
  console.log(
    `  among the ${result.overall.scorable.toLocaleString("en-US")} non-headword forms: lemma found ${percent(
      result.overall.lemmaAnyScorable,
      result.overall.scorable
    )}, missed ${(result.overall.scorable - result.overall.lemmaAnyScorable).toLocaleString("en-US")}`
  );

  for (const [group, stats] of Object.entries(result.byGroup)) {
    console.log(
      `  ${group.padEnd(8)} ${stats.total.toLocaleString("en-US")} forms · non-headword ${stats.scorable.toLocaleString(
        "en-US"
      )} · lemma found ${percent(stats.lemmaAnyScorable, stats.scorable)}`
    );
  }

  if (result.failures.length > 0) {
    console.log("\nSample misses:");
    for (const failure of result.failures.slice(0, 10)) {
      console.log(`  ${failure.form} → expected ${failure.lemma}, got [${failure.candidates.join(", ")}]`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
