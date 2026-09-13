/**
 * "Did you mean" suggestions for words with no dictionary entry.
 *
 * Candidates come from the frequency list (all common word forms) and are
 * filtered/ranked by a bounded Levenshtein distance plus prefix matching.
 * Dictionary-backed words are preferred over corpus-only words on ties, so a
 * suggestion is usually clickable straight into an entry.
 */
import type { LanguageCode } from "@bhashalens/core";
import { and, eq, sql } from "drizzle-orm";
import type { DbContext } from "./db/client.js";
import { wordFrequencies } from "./db/schema.js";

export interface Suggestion {
  distance: number;
  frequency: number;
  inDictionary: boolean;
  normalized: string;
  prefix: boolean;
  word: string;
}

export interface SuggestionInput {
  frequency: number;
  inDictionary: boolean;
  normalized: string;
  word: string;
}

export interface SuggestOptions {
  lang: LanguageCode;
  limit: number;
  query: string;
}

/**
 * Edit distance with early exit. Returns `null` as soon as the best possible
 * distance exceeds `max`, which keeps fuzzy search over thousands of rows cheap.
 */
export function boundedLevenshtein(a: string, b: string, max: number): number | null {
  if (Math.abs(a.length - b.length) > max) {
    return null;
  }

  const previous = new Array<number>(b.length + 1);
  const current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let best = current[0]!;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      best = Math.min(best, current[j]!);
    }

    if (best > max) {
      return null;
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j]!;
    }
  }

  return previous[b.length]! <= max ? previous[b.length]! : null;
}

/**
 * Rank candidate words for a query by true edit distance, then per distance:
 * dictionary-backed words, then raw frequency. Prefix relationships are only a
 * final tiebreak (a spelling correction should beat a longer inflection of the
 * misspelling).
 */
export function rankSuggestions(query: string, rows: SuggestionInput[], limit: number): Suggestion[] {
  const maxDistance = query.length <= 4 ? 1 : 2;
  const scored: Suggestion[] = [];

  for (const row of rows) {
    if (row.normalized === query || row.normalized.length === 0) {
      continue;
    }

    const distance = boundedLevenshtein(query, row.normalized, maxDistance);
    if (distance === null) {
      continue;
    }

    scored.push({
      distance,
      frequency: row.frequency,
      inDictionary: Boolean(row.inDictionary),
      normalized: row.normalized,
      prefix: row.normalized.startsWith(query) || query.startsWith(row.normalized),
      word: row.word
    });
  }

  scored.sort(
    (a, b) =>
      a.distance - b.distance ||
      Number(b.inDictionary) - Number(a.inDictionary) ||
      b.frequency - a.frequency ||
      Number(b.prefix) - Number(a.prefix)
  );

  return scored.slice(0, limit);
}

export function suggestWords(dbContext: DbContext, options: SuggestOptions): Suggestion[] {
  const query = options.query.normalize("NFC").trim();
  if (query.length < 2) {
    return [];
  }

  const maxDistance = query.length <= 4 ? 1 : 2;
  const rows = dbContext.db
    .select({
      frequency: wordFrequencies.count,
      inDictionary: sql<boolean>`exists (
        select 1 from dictionary_entries entry
        where entry.lang = ${options.lang} and entry.normalized = ${wordFrequencies.normalized}
      )`,
      normalized: wordFrequencies.normalized,
      word: wordFrequencies.word
    })
    .from(wordFrequencies)
    .where(
      and(
        eq(wordFrequencies.lang, options.lang),
        // Cheap length pre-filter so fuzzy scoring only sees plausible words.
        sql`length(${wordFrequencies.normalized}) between ${query.length - maxDistance} and ${query.length + maxDistance}`
      )
    )
    .all();

  return rankSuggestions(query, rows, options.limit);
}
