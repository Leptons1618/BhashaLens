import { BengaliAdapter } from "@bhashalens/core";
import { describe, expect, it } from "vitest";
import { createDbContext } from "./client.js";
import { dictionaryEntries, wordForms } from "./schema.js";
import {
  buildCoverageIndex,
  classifyWord,
  findMissingEntries,
  type CoverageIndex,
  type FrequencyWord
} from "./report-missing.js";

const adapter = new BengaliAdapter();

function makeIndex(dictionary: string[], forms: Array<[string, string]> = []): CoverageIndex {
  const formMap = new Map<string, string[]>();
  for (const [form, lemma] of forms) {
    formMap.set(form, [...(formMap.get(form) ?? []), lemma]);
  }
  return { dictionary: new Set(dictionary), forms: formMap };
}

describe("classifyWord", () => {
  it("covers exact dictionary words", () => {
    expect(classifyWord("বাংলা", makeIndex(["বাংলা"]), adapter).covered).toBe(true);
  });

  it("covers words resolvable through a form mapping", () => {
    const index = makeIndex(["যাওয়া"], [["গেলাম", "যাওয়া"]]);
    expect(classifyWord("গেলাম", index, adapter).covered).toBe(true);
  });

  it("does not cover a mapped form whose lemma is absent", () => {
    const index = makeIndex([], [["গেলাম", "যাওয়া"]]);
    expect(classifyWord("গেলাম", index, adapter).covered).toBe(false);
  });

  it("covers inflected words that morphology resolves", () => {
    expect(classifyWord("বাংলাদের", makeIndex(["বাংলা"]), adapter).covered).toBe(true);
  });

  it("reports uncovered words with their candidates", () => {
    const result = classifyWord("নতুনশব্দ", makeIndex(["বাংলা"]), adapter);
    expect(result.covered).toBe(false);
    expect(result.candidates).toContain("নতুনশব্দ");
  });
});

describe("findMissingEntries", () => {
  it("filters covered words and preserves rank order", () => {
    const words: FrequencyWord[] = [
      { count: 100, normalized: "বাংলা", rank: 1, word: "বাংলা" },
      { count: 50, normalized: "নতুনশব্দ", rank: 2, word: "নতুনশব্দ" },
      { count: 40, normalized: "বাংলাদের", rank: 3, word: "বাংলাদের" }
    ];
    const missing = findMissingEntries(words, makeIndex(["বাংলা"]), adapter);
    expect(missing.map((row) => row.word)).toEqual(["নতুনশব্দ"]);
  });
});

describe("buildCoverageIndex", () => {
  it("loads dictionary words and form mappings from the database", () => {
    const dbContext = createDbContext(":memory:");
    dbContext.db
      .insert(dictionaryEntries)
      .values({
        definition: "To go.",
        lang: "bn",
        normalized: "যাওয়া",
        partOfSpeech: "verb",
        source: "test",
        transliteration: "jaoya",
        word: "যাওয়া"
      })
      .run();
    dbContext.db
      .insert(wordForms)
      .values({
        form: "গেলাম",
        lang: "bn",
        lemma: "যাওয়া",
        lemmaWord: "যাওয়া",
        normalized: "গেলাম",
        source: "test",
        tags: ["first-person", "past"]
      })
      .run();

    const index = buildCoverageIndex(dbContext);
    dbContext.sqlite.close();

    expect(index.dictionary.has("যাওয়া")).toBe(true);
    expect(index.forms.get("গেলাম")).toEqual(["যাওয়া"]);
  });
});
