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
});
