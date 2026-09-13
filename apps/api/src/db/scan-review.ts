/**
 * Low-confidence entry scanner.
 *
 * Flags entries whose definitions are cross-references ("genitive of X"),
 * machine stubs, or otherwise need a human look. Flags live on the row
 * (`review_status` / `review_note`) so the admin API can list, edit, and
 * resolve them.
 *
 *   pnpm --filter @bhashalens/api scan:review
 */
import { fileURLToPath } from "node:url";
import { createDbContext, type DbContext } from "./client.js";

export interface ScanResult {
  byRule: Record<string, number>;
  flagged: number;
  scanned: number;
}

export interface ClassifiableEntry {
  definition: string;
  partOfSpeech: string;
  source?: string | null;
  word?: string;
}

/**
 * Wiktionary stores inflected forms as headwords with cross-reference glosses
 * ("genitive of বাংলাদেশ"). They are useful but should be reviewed, not shown
 * as independent definitions by default.
 */
const CROSS_REFERENCE_RE =
  /^(?:genitive|nominative|accusative|dative|locative|vocative|plural|singular|inflection|alternative|obsolete|misspelling|imperative|conditional|participle|verbal\s+noun|comparative|superlative)\b[^.]{0,48}?\bof\b/iu;

export function classifyEntry(entry: ClassifiableEntry): string[] {
  const notes: string[] = [];
  const definition = entry.definition.trim();

  if (CROSS_REFERENCE_RE.test(definition)) {
    notes.push("cross-reference gloss");
  }
  if (entry.word && definition === entry.word.trim()) {
    notes.push("definition repeats headword");
  }
  if (!/[\p{L}\p{N}]/u.test(definition)) {
    notes.push("empty-looking definition");
  }
  if (entry.partOfSpeech === "unknown" && entry.source !== "bengali-thesaurus") {
    notes.push("missing part of speech");
  }

  return notes;
}

export function scanReviewQueue(context: DbContext): ScanResult {
  const rows = context.sqlite
    .prepare("SELECT id, word, definition, part_of_speech, source, review_status FROM dictionary_entries")
    .all() as Array<{
    definition: string;
    id: number;
    part_of_speech: string;
    review_status: string;
    source: string | null;
    word: string;
  }>;

  const update = context.sqlite.prepare(
    `UPDATE dictionary_entries SET review_status = 'flagged', review_note = @note
     WHERE id = @id AND review_status NOT IN ('approved', 'dismissed')`
  );

  const byRule: Record<string, number> = {};
  let flagged = 0;

  const write = context.sqlite.transaction(() => {
    for (const row of rows) {
      if (row.review_status === "approved" || row.review_status === "dismissed") {
        continue;
      }

      const notes = classifyEntry({
        definition: row.definition,
        partOfSpeech: row.part_of_speech,
        source: row.source,
        word: row.word
      });
      if (notes.length === 0) {
        continue;
      }

      update.run({ id: row.id, note: notes.join(", ") });
      flagged += 1;
      for (const note of notes) {
        byRule[note] = (byRule[note] ?? 0) + 1;
      }
    }
  });

  write();
  return { byRule, flagged, scanned: rows.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const context = createDbContext();

  if (process.argv.includes("--reset")) {
    const cleared = context.sqlite
      .prepare("UPDATE dictionary_entries SET review_status = 'unreviewed', review_note = NULL WHERE review_status = 'flagged'")
      .run().changes;
    console.log(`Reset ${cleared.toLocaleString("en-US")} previous flags before scanning.`);
  }

  const result = scanReviewQueue(context);
  context.sqlite.close();

  console.log(`Scanned ${result.scanned.toLocaleString("en-US")} entries; flagged ${result.flagged.toLocaleString("en-US")} for review.`);
  for (const [rule, count] of Object.entries(result.byRule).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${rule}: ${count.toLocaleString("en-US")}`);
  }
  console.log(`\nReview: GET /admin/reviews (or open /admin and use the Review tab).`);
}
