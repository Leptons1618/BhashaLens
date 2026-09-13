import { describe, expect, it } from "vitest";
import { createDbContext } from "./client.js";
import { dictionaryEntries } from "./schema.js";
import { classifyEntry, scanReviewQueue } from "./scan-review.js";

describe("classifyEntry", () => {
  it("flags cross-reference glosses", () => {
    expect(classifyEntry({ definition: "genitive of বাংলাদেশ (baṅladeś)", partOfSpeech: "noun" })).toContain(
      "cross-reference gloss"
    );
    expect(classifyEntry({ definition: "Alternative form of করা", partOfSpeech: "verb" })).toContain(
      "cross-reference gloss"
    );
    expect(classifyEntry({ definition: "plural of বই", partOfSpeech: "noun" })).toContain("cross-reference gloss");
  });

  it("leaves ordinary definitions alone", () => {
    expect(classifyEntry({ definition: "A river; a flowing body of water.", partOfSpeech: "noun" })).toEqual([]);
  });

  it("flags definitions with no letters or digits", () => {
    expect(classifyEntry({ definition: "—", partOfSpeech: "noun" })).toContain("empty-looking definition");
    expect(classifyEntry({ definition: "and", partOfSpeech: "conjunction" })).toEqual([]);
  });

  it("flags missing parts of speech, except for thesaurus synonym lists", () => {
    expect(classifyEntry({ definition: "A river.", partOfSpeech: "unknown", source: "wiktextract" })).toContain(
      "missing part of speech"
    );
    expect(
      classifyEntry({ definition: "নদী; তটিনী", partOfSpeech: "unknown", source: "bengali-thesaurus" })
    ).toEqual([]);
  });

  it("flags definitions that merely repeat the headword", () => {
    expect(classifyEntry({ definition: "দমকল", partOfSpeech: "noun", word: "দমকল" })).toContain(
      "definition repeats headword"
    );
    expect(classifyEntry({ definition: "A fire engine.", partOfSpeech: "noun", word: "দমকল" })).toEqual([]);
  });
});

describe("scanReviewQueue", () => {
  it("flags matching rows, is idempotent, and skips resolved entries", () => {
    const dbContext = createDbContext(":memory:");
    dbContext.db
      .insert(dictionaryEntries)
      .values([
        {
          definition: "genitive of নদী",
          lang: "bn",
          normalized: "নদীর",
          partOfSpeech: "noun",
          source: "test",
          transliteration: "nodir",
          word: "নদীর"
        },
        {
          definition: "A river; a flowing body of water.",
          lang: "bn",
          normalized: "নদী",
          partOfSpeech: "noun",
          source: "test",
          transliteration: "nodi",
          word: "নদী"
        }
      ])
      .run();

    const first = scanReviewQueue(dbContext);
    expect(first.flagged).toBe(1);
    expect(first.byRule).toEqual({ "cross-reference gloss": 1 });

    const rows = dbContext.sqlite
      .prepare("SELECT normalized, review_note, review_status FROM dictionary_entries ORDER BY id")
      .all() as Array<{ normalized: string; review_note: string | null; review_status: string }>;
    expect(rows[0]).toEqual({
      normalized: "নদীর",
      review_note: "cross-reference gloss",
      review_status: "flagged"
    });
    expect(rows[1]?.review_status).toBe("unreviewed");

    // Re-running does not double-flag or change resolved entries.
    expect(scanReviewQueue(dbContext).flagged).toBe(1);
    dbContext.sqlite.prepare("UPDATE dictionary_entries SET review_status = 'approved' WHERE normalized = 'নদীর'").run();
    expect(scanReviewQueue(dbContext).flagged).toBe(0);

    dbContext.sqlite.close();
  });
});
