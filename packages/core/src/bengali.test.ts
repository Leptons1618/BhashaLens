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
});
