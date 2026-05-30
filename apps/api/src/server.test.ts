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

  it("translates via fallback once, then serves from cache", async () => {
    const dbContext = createDbContext(":memory:");
    let calls = 0;
    const app = await createServer({
      dbContext,
      logger: false,
      translate: async () => {
        calls += 1;
        return "warning";
      }
    });

    const url = "/translate?word=%E0%A6%B8%E0%A6%A4%E0%A6%B0%E0%A7%8D%E0%A6%95&from=bn&to=en";
    const first = (await app.inject({ method: "GET", url })).json();
    expect(first.found).toBe(true);
    expect(first.translation).toBe("warning");
    expect(first.cached).toBe(false);
    expect(first.provider).toBe("google-translate");

    const second = (await app.inject({ method: "GET", url })).json();
    expect(second.cached).toBe(true);
    expect(second.translation).toBe("warning");
    expect(calls).toBe(1); // second request did not hit the translator

    await app.close();
  });

  it("reports found:false when the translator returns nothing", async () => {
    const dbContext = createDbContext(":memory:");
    const app = await createServer({ dbContext, logger: false, translate: async () => null });

    const body = (
      await app.inject({ method: "GET", url: "/translate?word=%E0%A6%85%E0%A6%9C%E0%A6%BE%E0%A6%A8%E0%A6%BE" })
    ).json();
    expect(body.found).toBe(false);
    expect(body.translation).toBeNull();

    await app.close();
  });
});

describe("admin API", () => {
  it("creates, lists, searches, updates, and deletes entries", async () => {
    const dbContext = createDbContext(":memory:");
    const app = await createServer({ dbContext, logger: false });

    const created = await app.inject({
      method: "POST",
      url: "/admin/entries",
      payload: { word: "নদী", transliteration: "nodi", partOfSpeech: "noun", definition: "A river.", synonyms: "তটিনী, স্রোতস্বিনী" }
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().entry.id as number;
    expect(created.json().entry.synonyms).toEqual(["তটিনী", "স্রোতস্বিনী"]);

    const search = await app.inject({ method: "GET", url: "/admin/entries?q=nodi" });
    expect(search.json().total).toBe(1);
    expect(search.json().entries[0].word).toBe("নদী");

    const updated = await app.inject({
      method: "PUT",
      url: `/admin/entries/${id}`,
      payload: { word: "নদী", partOfSpeech: "noun", definition: "A flowing body of water." }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().entry.definition).toBe("A flowing body of water.");

    const removed = await app.inject({ method: "DELETE", url: `/admin/entries/${id}` });
    expect(removed.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/admin/entries" })).json().total).toBe(0);

    await app.close();
  });

  it("rejects non-Bengali or definition-less entries", async () => {
    const dbContext = createDbContext(":memory:");
    const app = await createServer({ dbContext, logger: false });

    expect((await app.inject({ method: "POST", url: "/admin/entries", payload: { word: "river", definition: "x" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/admin/entries", payload: { word: "নদী" } })).statusCode).toBe(400);

    await app.close();
  });

  it("enforces the admin token when configured", async () => {
    const dbContext = createDbContext(":memory:");
    const app = await createServer({ dbContext, logger: false, adminToken: "secret" });

    expect((await app.inject({ method: "GET", url: "/admin/entries" })).statusCode).toBe(401);
    const ok = await app.inject({ method: "GET", url: "/admin/entries", headers: { "x-admin-token": "secret" } });
    expect(ok.statusCode).toBe(200);

    await app.close();
  });

  it("serves the admin editor page", async () => {
    const dbContext = createDbContext(":memory:");
    const app = await createServer({ dbContext, logger: false });
    const page = await app.inject({ method: "GET", url: "/admin" });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.body).toContain("Dictionary Admin");
    await app.close();
  });
});
