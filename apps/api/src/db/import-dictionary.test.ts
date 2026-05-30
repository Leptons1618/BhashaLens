import { describe, expect, it } from "vitest";
import { parseDictionaryRecord } from "./import-dictionary.js";

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

  it("parses native BhashaLens JSON records", () => {
    const [entry] = parseDictionaryRecord(
      { word: "ভাষা", transliteration: "bhasha", partOfSpeech: "noun", definition: "Language." },
      "seed"
    );
    expect(entry.word).toBe("ভাষা");
    expect(entry.transliteration).toBe("bhasha");
  });
});
