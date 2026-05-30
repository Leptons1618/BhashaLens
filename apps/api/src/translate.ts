/**
 * Lightweight machine-translation fallback.
 *
 * Uses the public `translate.googleapis.com` gtx endpoint (the same one the web
 * widget uses) to translate a single Bengali word/phrase. This is a *fallback*
 * for words with no curated or Wiktionary entry — results are clearly labelled
 * as machine translation and cached separately from dictionary data.
 */

export type TranslateFn = (word: string, from: string, to: string, signal?: AbortSignal) => Promise<string | null>;

interface GoogleTranslateOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

/**
 * The gtx endpoint returns a deeply nested array; the translated segments live
 * in `data[0]`, each segment as `[translatedText, sourceText, ...]`.
 */
function parseGoogleResponse(payload: unknown): string | null {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return null;
  }

  const segments = payload[0] as unknown[];
  const text = segments
    .map((segment) => (Array.isArray(segment) ? segment[0] : undefined))
    .filter((value): value is string => typeof value === "string")
    .join("")
    .trim();

  return text.length > 0 ? text : null;
}

export function createGoogleTranslator(options: GoogleTranslateOptions = {}): TranslateFn {
  const fetcher = options.fetcher ?? fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 2500;

  return async (word, from, to, signal) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    signal?.addEventListener("abort", () => controller.abort(), { once: true });

    try {
      const params = new URLSearchParams({ client: "gtx", sl: from, tl: to, dt: "t", q: word });
      const response = await fetcher(`https://translate.googleapis.com/translate_a/single?${params.toString()}`, {
        headers: { accept: "application/json" },
        signal: controller.signal
      });

      if (!response.ok) {
        return null;
      }

      return parseGoogleResponse(await response.json());
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };
}

export { parseGoogleResponse };
