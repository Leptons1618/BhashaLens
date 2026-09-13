import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDbContext } from "./client.js";
import { importDictionaryFile, parseDictionaryForms, parseDictionaryRecord } from "./import-dictionary.js";

// A trimmed Kaikki/Wiktextract Bengali record covering the fields the importer reads.
const kaikkiRecord = {
  word: "বাংলা",
  lang: "Bengali",
  lang_code: "bn",
  pos: "name",
  forms: [
    { form: "baṅla", tags: ["romanization"] },
    { form: "বাংলার", tags: ["genitive"] }
  ],
  sounds: [
    { ipa: "[ˈbaŋlaˑ]", note: "Rarh" },
    { ipa: "/baŋla/", note: "Rarh" }
  ],
  synonyms: [{ word: "বঙ্গ" }],
  senses: [
    {
      glosses: ["Bengal (region)"],
      examples: [{ text: "সোনার বাংলা", english: "golden Bengal" }]
    }
  ]
};

describe("parseDictionaryRecord (Wiktextract)", () => {
  it("reads romanization from forms, not sounds", () => {
    const [entry] = parseDictionaryRecord(kaikkiRecord, "wiktextract");
    expect(entry.transliteration).toBe("baṅla");
  });

  it("prefers a phonemic /…/ IPA over a bracketed [..] one", () => {
    const [entry] = parseDictionaryRecord(kaikkiRecord, "wiktextract");
    expect(entry.ipa).toBe("/baŋla/");
  });

  it("normalizes terse POS codes and captures examples + synonyms", () => {
    const [entry] = parseDictionaryRecord(kaikkiRecord, "wiktextract");
    expect(entry.partOfSpeech).toBe("proper noun");
    expect(entry.definition).toBe("Bengal (region)");
    expect(entry.examples).toEqual(["সোনার বাংলা — golden Bengal"]);
    expect(entry.synonyms).toEqual(["বঙ্গ"]);
    expect(entry.source).toBe("wiktextract");
  });

  it("drops non-Bengali or definition-less records", () => {
    expect(parseDictionaryRecord({ word: "hello", lang_code: "en", senses: [{ glosses: ["hi"] }] })).toEqual([]);
    expect(parseDictionaryRecord({ word: "বাংলা", lang_code: "bn", senses: [{}] })).toEqual([]);
  });

  it("parses bn→bn thesaurus records (bn + bn_syns)", () => {
    const [entry] = parseDictionaryRecord(
      { bn: "নদী", bn_syns: ["তটিনী", "স্রোতস্বিনী"], en: "river", pron: ["nodi", "nodi"] },
      "bengali-thesaurus"
    );
    expect(entry.word).toBe("নদী");
    expect(entry.definition).toBe("তটিনী; স্রোতস্বিনী");
    expect(entry.synonyms).toEqual(["তটিনী", "স্রোতস্বিনী"]);
    expect(entry.source).toBe("bengali-thesaurus");
  });

  it("falls back to the English gloss when a thesaurus record has no synonyms", () => {
    const [entry] = parseDictionaryRecord({ bn: "জল", bn_syns: [], en: "water" }, "bengali-thesaurus");
    expect(entry.definition).toBe("water");
  });

  it("parses native BhashaLens JSON records", () => {
    const [entry] = parseDictionaryRecord(
      { word: "ভাষা", transliteration: "bhasha", partOfSpeech: "noun", definition: "Language." },
      "seed"
    );
    expect(entry.word).toBe("ভাষা");
    expect(entry.transliteration).toBe("bhasha");
  });
});

describe("Bangla WordNet import", () => {
  const previousDatabaseFile = process.env.DATABASE_FILE;

  afterEach(() => {
    if (previousDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previousDatabaseFile;
    }
  });

  it("maps synsets to entries with Bengali glosses and synonyms", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bhashalens-wordnet-"));
    process.env.DATABASE_FILE = join(dir, "test.sqlite");
    const filePath = join(dir, "wordnet.yaml");
    writeFileSync(
      filePath,
      [
        "-",
        " ID: 1",
        " CAT: ADJECTIVE",
        " CONCEPT: যে জন্মগ্রহণ করেনি",
        ' EXAMPLE: "সে অজাত"',
        " SYNSET-BENGALI: অজাত, অনুত্পন্ন, অনুদ্ভূত"
      ].join("\n")
    );

    const result = await importDictionaryFile({ filePath, source: "bangla-wordnet" });
    expect(result.inserted).toBe(3);

    const context = createDbContext();
    const row = context.sqlite
      .prepare("SELECT definition, part_of_speech, examples, synonyms FROM dictionary_entries WHERE normalized = ?")
      .get("অজাত") as { definition: string; part_of_speech: string; examples: string; synonyms: string };
    context.sqlite.close();

    expect(row.definition).toBe("যে জন্মগ্রহণ করেনি");
    expect(row.part_of_speech).toBe("adjective");
    expect(JSON.parse(row.examples)).toEqual(["সে অজাত"]);
    expect(JSON.parse(row.synonyms)).toEqual(["অনুত্পন্ন", "অনুদ্ভূত"]);
  });
});

describe("parseDictionaryForms (Wiktextract)", () => {
  const verbRecord = {
    word: "যাওয়া",
    lang_code: "bn",
    pos: "verb",
    forms: [
      { form: "jaōẇa", tags: ["romanization"] },
      { form: "no-table-tags", tags: ["table-tags"] },
      { form: "bn-conj-যাওয়া", tags: ["inflection-template"] },
      { form: "যাওয়া", tags: ["noun-from-verb"] },
      { form: "যেতে", tags: ["infinitive"] },
      { form: "গেলাম / gelam (semantically definite))", tags: ["first-person", "past"] },
      { form: "-রে marks this case instead of -কে (-ke).", tags: ["objective"] },
      { form: "আরও বাংলা", tags: ["adjective"] },
      { form: "গেলাম", tags: ["first-person", "past"] }
    ]
  };

  it("mines inflected forms with their lemma and grammatical tags", () => {
    const forms = parseDictionaryForms(verbRecord);
    expect(forms.map((form) => form.normalized)).toEqual(["যেতে", "গেলাম"]);
    expect(forms[1]).toMatchObject({
      form: "গেলাম",
      lemma: "যাওয়া",
      lemmaWord: "যাওয়া",
      normalized: "গেলাম",
      tags: ["first-person", "past"]
    });
  });

  it("skips romanization, table scaffolding, the identity form, phrase rows, and notes", () => {
    const values = parseDictionaryForms(verbRecord).map((form) => form.form);
    expect(values).not.toContain("jaōẇa");
    expect(values).not.toContain("no-table-tags");
    expect(values).not.toContain("যাওয়া");
    expect(values).not.toContain("-রে marks this case instead of -কে (-ke).");
    expect(values).not.toContain("আরও বাংলা");
  });

  it("ignores non-Bengali records", () => {
    expect(parseDictionaryForms({ lang_code: "en", word: "go", forms: [{ form: "went" }] })).toEqual([]);
    expect(parseDictionaryForms({ lang_code: "bn", word: "hello", forms: [] })).toEqual([]);
    expect(parseDictionaryForms(null)).toEqual([]);
  });
});
