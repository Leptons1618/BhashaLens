import { describe, expect, it } from "vitest";
import { duckDuckGoSearch, googleSearch } from "./search.js";

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
}

describe("duckDuckGoSearch", () => {
  it("parses titles, snippets, and decodes redirect URLs", async () => {
    const html = `
      <div class="result">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fbn.wikipedia.org%2Fwiki%2F%E0%A6%A8%E0%A6%A6%E0%A7%80">নদী — Wikipedia</a>
        <a class="result__snippet" href="#">A river is a natural flowing watercourse.</a>
      </div>`;
    const fetcher = (async () => htmlResponse(html)) as unknown as typeof fetch;

    const results = await duckDuckGoSearch("নদী", fetcher);
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("নদী — Wikipedia");
    expect(results[0]!.url).toBe("https://bn.wikipedia.org/wiki/নদী");
    expect(results[0]!.snippet).toContain("natural flowing");
  });

  it("returns an empty list on a non-ok response", async () => {
    const fetcher = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await duckDuckGoSearch("x", fetcher)).toEqual([]);
  });
});

describe("googleSearch (best-effort)", () => {
  it("returns [] when Google serves no parseable results", async () => {
    const fetcher = (async () => htmlResponse("<html><body>consent</body></html>")) as unknown as typeof fetch;
    expect(await googleSearch("নদী", fetcher)).toEqual([]);
  });

  it("never throws when the request fails", async () => {
    const fetcher = (async () => {
      throw new Error("blocked");
    }) as unknown as typeof fetch;
    expect(await googleSearch("নদী", fetcher)).toEqual([]);
  });
});
