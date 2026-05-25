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
});
