import { describe, expect, it } from "vitest";
import { MemoryDictionaryProvider } from "./providers.js";

describe("MemoryDictionaryProvider", () => {
  it("looks up normalized entries", async () => {
    const provider = new MemoryDictionaryProvider([
      {
        definition: "Language.",
        lang: "bn",
        normalized: "ভাষা",
        partOfSpeech: "noun",
        transliteration: "bhasha",
        word: "ভাষা"
      }
    ]);

    const result = await provider.lookup("ভাষা", "bn");
    expect(result.found).toBe(true);
    expect(result.entries[0]?.transliteration).toBe("bhasha");
  });
});
