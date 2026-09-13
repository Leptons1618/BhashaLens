import { describe, expect, it } from "vitest";
import { BengaliAdapter, containsBengali, normalizeBengali } from "./bengali.js";

describe("BengaliAdapter", () => {
  const adapter = new BengaliAdapter();

  it("detects Bengali Unicode text", () => {
    expect(containsBengali("বাংলা")).toBe(true);
    expect(containsBengali("hello")).toBe(false);
  });

  it("normalizes text with NFC and trims whitespace", () => {
    expect(normalizeBengali("  ভালো  ")).toBe("ভালো");
  });

  it("extracts a Bengali word at an offset", () => {
    const span = adapter.extractWordAt("এই বাংলা ভাষা", 5);
    expect(span?.normalized).toBe("বাংলা");
    expect(span?.start).toBe(3);
  });

  it("generates conservative morphology fallback candidates", () => {
    const analysis = adapter.analyzeMorphology("বাংলাদের");
    expect(analysis.complexity).toBe("inflected");
    expect(analysis.candidates.some((candidate) => candidate.normalized === "বাংলা")).toBe(true);
  });

  it("strips multi-morpheme endings across passes", () => {
    const stems = adapter.analyzeMorphology("বইগুলোকে").candidates.map((c) => c.normalized);
    expect(stems).toContain("বইগুলো"); // first pass
    expect(stems).toContain("বই"); // second pass
  });

  it("resolves an inflected noun to its dictionary headword", () => {
    const stems = adapter.analyzeMorphology("মানুষটিকে").candidates.map((c) => c.normalized);
    expect(stems).toContain("মানুষ");
  });

  it("lemmatizes a conjugated verb to its infinitive form", () => {
    const lemma = adapter.analyzeMorphology("করেছিলাম").candidates.find((c) => c.reason === "lemma" && c.normalized === "করা");
    expect(lemma).toBeDefined();
  });

  it("keeps exact match as the highest-confidence candidate", () => {
    const [first] = adapter.analyzeMorphology("মানুষটিকে").candidates;
    expect(first?.reason).toBe("exact");
    expect(first?.confidence).toBe(1);
  });

  it("walks the noun marker slots right-to-left (BanLemma examples)", () => {
    const cases: Array<[string, string]> = [
      ["শিশুদেরটাতেও", "শিশু"], // plural + determiner + case + emphasis
      ["বইগুলিতেই", "বই"], // plural + case + emphasis
      ["গাছটাতেও", "গাছ"], // determiner + case + emphasis
      ["শিক্ষককে", "শিক্ষক"], // case only
      ["জনগণই", "জনগণ"], // emphasis only
      ["মানুষের", "মানুষ"] // case ের
    ];

    for (const [word, lemma] of cases) {
      const stems = adapter.analyzeMorphology(word).candidates.map((candidate) => candidate.normalized);
      expect(stems, word).toContain(lemma);
    }
  });

  it("records the stripped marker sequence on the matched candidate", () => {
    const candidate = adapter
      .analyzeMorphology("বইগুলিতেই")
      .candidates.find((item) => item.normalized === "বই");
    expect(candidate?.suffix).toContain("গুলি");
    expect(candidate?.suffix).toContain("তে");
    expect(candidate?.suffix).toContain("ই");
  });

  it("lemmatizes more conjugated verbs to their infinitive form", () => {
    const infinitive = (word: string): string | undefined =>
      adapter.analyzeMorphology(word).candidates.find((candidate) => candidate.reason === "lemma")?.normalized;

    expect(infinitive("খেললাম")).toBe("খেলা");
    expect(infinitive("দেখিয়েছি")).toBe("দেখা");
  });
});
