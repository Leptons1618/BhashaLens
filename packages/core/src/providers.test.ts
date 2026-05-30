import { describe, expect, it, vi } from "vitest";
import { MemoryDictionaryProvider, RestTranslationProvider } from "./providers.js";

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

describe("RestTranslationProvider", () => {
  it("calls the /translate endpoint and returns the result", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ cached: false, found: true, provider: "google-translate", translation: "warning", word: "সতর্ক" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const provider = new RestTranslationProvider({ baseUrl: "http://localhost:8787/", fetcher });

    const result = await provider.translate("সতর্ক");
    expect(result.translation).toBe("warning");
    expect(result.found).toBe(true);

    const calledUrl = String(fetcher.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("/translate?");
    expect(calledUrl).toContain("from=bn");
    expect(calledUrl).toContain("to=en");
  });

  it("returns an empty result for blank input without calling fetch", async () => {
    const fetcher = vi.fn();
    const provider = new RestTranslationProvider({ baseUrl: "http://localhost:8787", fetcher });
    const result = await provider.translate("   ");
    expect(result.found).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
