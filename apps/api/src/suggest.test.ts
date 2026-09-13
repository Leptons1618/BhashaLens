import { describe, expect, it } from "vitest";
import { boundedLevenshtein, rankSuggestions } from "./suggest.js";

describe("boundedLevenshtein", () => {
  it("computes edit distance within the bound", () => {
    expect(boundedLevenshtein("বাংলা", "বাংলা", 2)).toBe(0);
    expect(boundedLevenshtein("বাংলা", "বাঙলা", 2)).toBe(1);
    expect(boundedLevenshtein("বাংলা", "বাংলাা", 2)).toBe(1);
  });

  it("returns null once the distance exceeds the bound", () => {
    expect(boundedLevenshtein("বাংলা", "দেশ", 2)).toBeNull();
    expect(boundedLevenshtein("abc", "abcd", 0)).toBeNull();
  });
});

describe("rankSuggestions", () => {
  const row = (word: string, frequency: number, inDictionary: boolean) => ({
    frequency,
    inDictionary,
    normalized: word,
    word
  });

  it("excludes the query itself and ranks nearer words first", () => {
    const ranked = rankSuggestions(
      "বাংলাদেশ",
      [
        row("বাংলাদেশ", 99_999, true),
        row("বাংলাদেশের", 5000, true),
        row("বাংলদেশ", 300, true),
        row("বাঙলাদেশ", 100, true)
      ],
      5
    );
    expect(ranked.map((suggestion) => suggestion.word)).toEqual(["বাংলদেশ", "বাঙলাদেশ", "বাংলাদেশের"]);
    expect(ranked.map((suggestion) => suggestion.distance)).toEqual([1, 1, 2]);
  });

  it("prefers dictionary-backed words over corpus-only words on ties", () => {
    const ranked = rankSuggestions(
      "বাংলাদেশ",
      [row("বাংলাদেশি", 1000, false), row("বাংলাদেশী", 50, true)],
      5
    );
    expect(ranked[0]?.word).toBe("বাংলাদেশী");
  });

  it("prefers the more frequent word over a longer inflection of the misspelling", () => {
    const ranked = rankSuggestions("ভালবাসা", [row("ভালবাসার", 393, true), row("ভালোবাসা", 1680, true)], 5);
    expect(ranked[0]?.word).toBe("ভালোবাসা");
  });

  it("catches a one-character typo and rejects unrelated words", () => {
    const ranked = rankSuggestions("সতর্কিকরণ", [row("সতর্কীকরণ", 800, true), row("সমর্থন", 9000, true)], 5);
    expect(ranked.map((suggestion) => suggestion.word)).toContain("সতর্কীকরণ");
    expect(ranked.map((suggestion) => suggestion.word)).not.toContain("সমর্থন");
  });

  it("respects the limit", () => {
    const rows = ["বাংলাদেশের", "বাংলদেশ", "বাঙলাদেশ", "বাংলাদেশি"].map((word) => row(word, 10, true));
    expect(rankSuggestions("বাংলাদেশ", rows, 2)).toHaveLength(2);
  });
});
