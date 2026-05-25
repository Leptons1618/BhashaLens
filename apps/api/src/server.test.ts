import { describe, expect, it } from "vitest";
import { createDbContext } from "./db/client.js";
import { dictionaryEntries } from "./db/schema.js";
import { createServer } from "./server.js";

describe("lookup API", () => {
  it("returns a Bengali dictionary entry by normalized word", async () => {
    const dbContext = createDbContext(":memory:");
    dbContext.db
      .insert(dictionaryEntries)
      .values({
        definition: "Good; pleasant; well.",
        lang: "bn",
        normalized: "ভালো",
        partOfSpeech: "adjective",
        source: "test",
        transliteration: "bhalo",
        word: "ভালো"
      })
      .run();

    const app = await createServer({ dbContext, logger: false });
    const response = await app.inject({
      method: "GET",
      url: "/lookup?word=%E0%A6%AD%E0%A6%BE%E0%A6%B2%E0%A7%8B&lang=bn"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.found).toBe(true);
    expect(body.entries[0].transliteration).toBe("bhalo");

    await app.close();
  });

  it("falls back from a simple inflected form to a root candidate", async () => {
    const dbContext = createDbContext(":memory:");
    dbContext.db
      .insert(dictionaryEntries)
      .values({
        definition: "The Bengali language; something belonging to Bengal.",
        lang: "bn",
        normalized: "বাংলা",
        partOfSpeech: "noun",
        source: "test",
        transliteration: "bangla",
        word: "বাংলা"
      })
      .run();

    const app = await createServer({ dbContext, logger: false });
    const response = await app.inject({
      method: "GET",
      url: "/lookup?word=%E0%A6%AC%E0%A6%BE%E0%A6%82%E0%A6%B2%E0%A6%BE%E0%A6%A6%E0%A7%87%E0%A6%B0&lang=bn"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.found).toBe(true);
    expect(body.lookupWord).toBe("বাংলা");
    expect(body.matchedCandidate.reason).toBe("suffix-strip");

    await app.close();
  });
});
