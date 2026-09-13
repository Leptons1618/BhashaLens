import { describe, expect, it } from "vitest";
import { parseWordNetYaml } from "./wordnet.js";

const sample = `#A sample wordnet file
-
 ID: 1
 CAT: ADJECTIVE
 CONCEPT: যে জন্মগ্রহণ করেনি
 EXAMPLE: "সে অজাত"
 SYNSET-BENGALI: অজাত, অনুত্পন্ন, অনুদ্ভূত, অজ, অনাগত
-
 ID: 4
 CAT: NOUN
 CONCEPT: সেই স্থান যাকে পবিত্র বলে মনে করা হয়
 EXAMPLE: "হিন্দুদের কাছে কাশী একটি পবিত্র স্থান"
 SYNSET-BENGALI: পবিত্র_স্থান, পুণ্য_ভূমি
`;

describe("parseWordNetYaml", () => {
  it("parses synsets with categories, glosses, and member words", () => {
    const synsets = parseWordNetYaml(sample);
    expect(synsets).toHaveLength(2);
    expect(synsets[0]).toMatchObject({ category: "ADJECTIVE", concept: "যে জন্মগ্রহণ করেনি", id: "1" });
    expect(synsets[0]?.words).toEqual(["অজাত", "অনুত্পন্ন", "অনুদ্ভূত", "অজ", "অনাগত"]);
  });

  it("turns underscores into spaces in multi-word synonyms", () => {
    expect(parseWordNetYaml(sample)[1]?.words).toEqual(["পবিত্র স্থান", "পুণ্য ভূমি"]);
  });

  it("strips quotes from examples and skips blank/comment lines", () => {
    expect(parseWordNetYaml(sample)[0]?.example).toBe("সে অজাত");
    expect(parseWordNetYaml("")).toEqual([]);
  });
});
