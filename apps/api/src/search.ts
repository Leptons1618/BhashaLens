/**
 * Web search snippets for the bubble's "Web" tab.
 *
 * DuckDuckGo's HTML endpoint is scrape-friendly and reliable. Google actively
 * blocks programmatic access, so `googleSearch` is best-effort: it returns
 * whatever parses and an empty list when Google serves a consent/captcha page.
 * Both take an injectable fetcher for testing.
 */

export interface SearchItem {
  snippet: string;
  title: string;
  url: string;
}

export type SearchFn = (query: string, fetcher?: typeof fetch) => Promise<SearchItem[]>;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** DuckDuckGo wraps outbound links as //duckduckgo.com/l/?uddg=<encoded>. */
function resolveDuckUrl(href: string): string {
  const match = /[?&]uddg=([^&]+)/.exec(href);
  if (match) {
    try {
      return decodeURIComponent(match[1]!);
    } catch {
      return href;
    }
  }
  return href.startsWith("//") ? `https:${href}` : href;
}

export async function duckDuckGoSearch(query: string, fetcher: typeof fetch = fetch): Promise<SearchItem[]> {
  const response = await fetcher(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" }
  });
  if (!response.ok) {
    return [];
  }

  const html = await response.text();
  const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

  const links: Array<{ title: string; url: string }> = [];
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRe.exec(html)) && links.length < 6) {
    links.push({ title: stripTags(linkMatch[2]!), url: resolveDuckUrl(linkMatch[1]!) });
  }

  const snippets: string[] = [];
  let snippetMatch: RegExpExecArray | null;
  while ((snippetMatch = snippetRe.exec(html)) && snippets.length < 6) {
    snippets.push(stripTags(snippetMatch[1]!));
  }

  return links
    .filter((link) => link.title.length > 0)
    .map((link, index) => ({ snippet: snippets[index] ?? "", title: link.title, url: link.url }));
}

/** Best-effort Google scrape; returns [] when Google blocks the request. */
export async function googleSearch(query: string, fetcher: typeof fetch = fetch): Promise<SearchItem[]> {
  let html: string;
  try {
    const response = await fetcher(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=en`, {
      headers: { "user-agent": USER_AGENT, accept: "text/html", "accept-language": "en-US,en;q=0.9" }
    });
    if (!response.ok) {
      return [];
    }
    html = await response.text();
  } catch {
    return [];
  }

  const items: SearchItem[] = [];
  // Google result blocks: <a href="/url?q=<real>&..."> ... <h3>Title</h3>
  const blockRe = /<a href="\/url\?q=([^"&]+)[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((match = blockRe.exec(html)) && items.length < 6) {
    let url: string;
    try {
      url = decodeURIComponent(match[1]!);
    } catch {
      url = match[1]!;
    }
    const title = stripTags(match[2]!);
    if (!title || url.startsWith("https://www.google.") || seen.has(url)) {
      continue;
    }
    seen.add(url);
    items.push({ snippet: "", title, url });
  }
  return items;
}
