import { describe, expect, it } from "vitest";
import { createDbContext } from "./db/client.js";
import { dictionaryEntries, wordForms, wordFrequencies } from "./db/schema.js";
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

  it("prefers the more frequent stem when several candidates have entries", async () => {
    const dbContext = createDbContext(":memory:");
    dbContext.db
      .insert(dictionaryEntries)
      .values([
        {
          definition: "Human being.",
          lang: "bn",
          normalized: "মানুষ",
          partOfSpeech: "noun",
          source: "test",
          transliteration: "manush",
          word: "মানুষ"
        },
        {
          definition: "The person.",
          lang: "bn",
          normalized: "মানুষটি",
          partOfSpeech: "noun",
          source: "test",
          transliteration: "manushti",
          word: "মানুষটি"
        }
      ])
      .run();
    dbContext.db
      .insert(wordFrequencies)
      .values([
        { lang: "bn", word: "মানুষ", normalized: "মানুষ", count: 1000, rank: 1, source: "bnwiki" },
        { lang: "bn", word: "মানুষটি", normalized: "মানুষটি", count: 5, rank: 2, source: "bnwiki" }
      ])
      .run();

    const app = await createServer({ dbContext, logger: false });
    const body = (
      await app.inject({ method: "GET", url: `/lookup?word=${encodeURIComponent("মানুষটিকে")}&lang=bn` })
    ).json();

    expect(body.found).toBe(true);
    expect(body.lookupWord).toBe("মানুষ");

    await app.close();
  });

  it("resolves irregular verb forms through the Wiktionary form table", async () => {
    const dbContext = createDbContext(":memory:");
    dbContext.db
      .insert(dictionaryEntries)
      .values({
        definition: "To go.",
        lang: "bn",
        normalized: "যাওয়া",
        partOfSpeech: "verb",
        source: "test",
        transliteration: "jaoya",
        word: "যাওয়া"
      })
      .run();
    dbContext.db
      .insert(wordForms)
      .values({
        form: "গেলাম",
        lang: "bn",
        lemma: "যাওয়া",
        lemmaWord: "যাওয়া",
        normalized: "গেলাম",
        source: "test",
        tags: ["first-person", "past"]
      })
      .run();

    const app = await createServer({ dbContext, logger: false });
    const body = (
      await app.inject({ method: "GET", url: `/lookup?word=${encodeURIComponent("গেলাম")}&lang=bn` })
    ).json();

    expect(body.found).toBe(true);
    expect(body.lookupWord).toBe("যাওয়া");
    expect(body.matchedCandidate.reason).toBe("form");
    expect(body.matchedCandidate.suffix).toBe("first-person + past");

    await app.close();
  });

  it("suggests close words when a lookup finds nothing", async () => {
    const dbContext = createDbContext(":memory:");
    dbContext.db
      .insert(dictionaryEntries)
      .values({
        definition: "Warning.",
        lang: "bn",
        normalized: "সতর্কীকরণ",
        partOfSpeech: "noun",
        source: "test",
        transliteration: "satarkikoron",
        word: "সতর্কীকরণ"
      })
      .run();
    dbContext.db
      .insert(wordFrequencies)
      .values({ count: 500, lang: "bn", normalized: "সতর্কীকরণ", rank: 1, source: "test", word: "সতর্কীকরণ" })
      .run();

    const app = await createServer({ dbContext, logger: false });
    const misspelled = encodeURIComponent("সতর্কিকরণ");
    const lookup = (await app.inject({ method: "GET", url: `/lookup?word=${misspelled}&lang=bn` })).json();
    expect(lookup.found).toBe(false);
    expect(lookup.suggestions.map((item: { word: string }) => item.word)).toContain("সতর্কীকরণ");

    const direct = (await app.inject({ method: "GET", url: `/suggest?q=${misspelled}&lang=bn&limit=3` })).json();
    expect(direct.suggestions[0].word).toBe("সতর্কীকরণ");
    expect(direct.suggestions[0].inDictionary).toBe(true);

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

  it("returns grouped web search results and caches them", async () => {
    const dbContext = createDbContext(":memory:");
    let ddgCalls = 0;
    const app = await createServer({
      dbContext,
      logger: false,
      search: {
        duckduckgo: async (q) => {
          ddgCalls += 1;
          return [{ title: "Result for " + q, snippet: "A snippet.", url: "https://example.com" }];
        },
        google: async () => []
      }
    });

    const first = (await app.inject({ method: "GET", url: "/search?q=%E0%A6%A8%E0%A6%A6%E0%A7%80&engines=duckduckgo,google" })).json();
    expect(first.groups).toHaveLength(2);
    const ddg = first.groups.find((g: { engine: string }) => g.engine === "duckduckgo");
    expect(ddg.label).toBe("DuckDuckGo");
    expect(ddg.items[0].title).toContain("Result for");

    await app.inject({ method: "GET", url: "/search?q=%E0%A6%A8%E0%A6%A6%E0%A7%80&engines=duckduckgo" });
    expect(ddgCalls).toBe(1); // second call served from cache

    await app.close();
  });

  it("scans, lists, and resolves the review queue", async () => {
    const dbContext = createDbContext(":memory:");
    const app = await createServer({ dbContext, logger: false });

    await app.inject({
      method: "POST",
      url: "/admin/entries",
      payload: { definition: "genitive of নদী", partOfSpeech: "noun", transliteration: "nodir", word: "নদীর" }
    });
    await app.inject({
      method: "POST",
      url: "/admin/entries",
      payload: { definition: "A river.", partOfSpeech: "noun", transliteration: "nodi", word: "নদী" }
    });

    const scan = await app.inject({ method: "POST", url: "/admin/reviews/scan" });
    expect(scan.json().flagged).toBe(1);

    const list = (await app.inject({ method: "GET", url: "/admin/reviews" })).json();
    expect(list.total).toBe(1);
    const entry = list.entries[0];
    expect(entry.word).toBe("নদীর");
    expect(entry.reviewStatus).toBe("flagged");
    expect(entry.reviewNote).toContain("cross-reference");

    const resolved = await app.inject({
      method: "POST",
      url: `/admin/reviews/${entry.id}/resolve`,
      payload: { status: "approved" }
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().entry.reviewStatus).toBe("approved");

    expect((await app.inject({ method: "GET", url: "/admin/reviews" })).json().total).toBe(0);
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
