import type {
  DictionaryEntry,
  DictionaryProvider,
  LanguageCode,
  LookupResponse,
  SearchProvider,
  SearchResponse,
  TranslationProvider,
  TranslationResult
} from "./types.js";

export interface RestDictionaryProviderOptions {
  baseUrl: string;
  cacheTtlMs?: number;
  defaultLang?: LanguageCode;
  fetcher?: typeof fetch;
  maxCacheEntries?: number;
  timeoutMs?: number;
}

interface CacheRecord {
  expiresAt: number;
  value: LookupResponse;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 700;
const DEFAULT_MAX_CACHE_ENTRIES = 500;

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function normalizeLookupWord(word: string): string {
  return word.normalize("NFC").trim();
}

function cacheKey(lang: LanguageCode, normalized: string): string {
  return `${lang}:${normalized}`;
}

function createEmptyResponse(word: string, lang: LanguageCode): LookupResponse {
  const normalized = normalizeLookupWord(word);

  return {
    entries: [],
    found: false,
    query: {
      lang,
      normalized,
      word
    }
  };
}

export class RestDictionaryProvider implements DictionaryProvider {
  private readonly baseUrl: string;
  private readonly cache = new Map<string, CacheRecord>();
  private readonly cacheTtlMs: number;
  private readonly defaultLang: LanguageCode;
  private readonly fetcher: typeof fetch;
  private readonly maxCacheEntries: number;
  private readonly timeoutMs: number;

  constructor(options: RestDictionaryProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.defaultLang = options.defaultLang ?? "bn";
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async lookup(word: string, lang: LanguageCode = this.defaultLang, signal?: AbortSignal): Promise<LookupResponse> {
    const normalized = normalizeLookupWord(word);
    if (normalized.length === 0) {
      return createEmptyResponse(word, lang);
    }

    const key = cacheKey(lang, normalized);
    const cached = this.cache.get(key);
    const currentTime = now();

    if (cached && cached.expiresAt > currentTime) {
      return cached.value;
    }

    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });

    try {
      const params = new URLSearchParams({ lang, word: normalized });
      const response = await this.fetcher(`${this.baseUrl}/lookup?${params.toString()}`, {
        headers: {
          accept: "application/json"
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Lookup failed with HTTP ${response.status}`);
      }

      const result = (await response.json()) as LookupResponse;
      this.setCache(key, result);
      return result;
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  private setCache(key: string, value: LookupResponse): void {
    if (this.cache.size >= this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      expiresAt: now() + this.cacheTtlMs,
      value
    });
  }
}

export interface RestTranslationProviderOptions {
  baseUrl: string;
  defaultFrom?: LanguageCode;
  defaultTo?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

/** Calls the BhashaLens `/translate` fallback endpoint (cached, server-side). */
export class RestTranslationProvider implements TranslationProvider {
  private readonly baseUrl: string;
  private readonly defaultFrom: LanguageCode;
  private readonly defaultTo: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: RestTranslationProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.defaultFrom = options.defaultFrom ?? "bn";
    this.defaultTo = options.defaultTo ?? "en";
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 2500;
  }

  async translate(word: string, from: string = this.defaultFrom, to: string = this.defaultTo, signal?: AbortSignal): Promise<TranslationResult> {
    const normalized = word.normalize("NFC").trim();
    const empty: TranslationResult = { cached: false, found: false, provider: "google-translate", translation: null, word: normalized };
    if (normalized.length === 0) {
      return empty;
    }

    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });

    try {
      const params = new URLSearchParams({ from, to, word: normalized });
      const response = await this.fetcher(`${this.baseUrl}/translate?${params.toString()}`, {
        headers: { accept: "application/json" },
        signal: controller.signal
      });

      if (!response.ok) {
        return empty;
      }

      return (await response.json()) as TranslationResult;
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}

export interface RestSearchProviderOptions {
  baseUrl: string;
  defaultEngines?: string[];
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

/** Calls the BhashaLens `/search` endpoint (DuckDuckGo + best-effort Google). */
export class RestSearchProvider implements SearchProvider {
  private readonly baseUrl: string;
  private readonly defaultEngines: string[];
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: RestSearchProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.defaultEngines = options.defaultEngines ?? ["duckduckgo", "google"];
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 4000;
  }

  async search(query: string, engines: string[] = this.defaultEngines, signal?: AbortSignal): Promise<SearchResponse> {
    const normalized = query.normalize("NFC").trim();
    const empty: SearchResponse = { groups: [], query: normalized };
    if (normalized.length === 0) {
      return empty;
    }

    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });

    try {
      const params = new URLSearchParams({ engines: engines.join(","), q: normalized });
      const response = await this.fetcher(`${this.baseUrl}/search?${params.toString()}`, {
        headers: { accept: "application/json" },
        signal: controller.signal
      });

      if (!response.ok) {
        return empty;
      }

      return (await response.json()) as SearchResponse;
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}

export class MemoryDictionaryProvider implements DictionaryProvider {
  private readonly entriesByKey = new Map<string, DictionaryEntry[]>();

  constructor(entries: DictionaryEntry[]) {
    for (const entry of entries) {
      const key = cacheKey(entry.lang, entry.normalized.normalize("NFC"));
      const current = this.entriesByKey.get(key) ?? [];
      current.push(entry);
      this.entriesByKey.set(key, current);
    }
  }

  async lookup(word: string, lang: LanguageCode = "bn"): Promise<LookupResponse> {
    const normalized = normalizeLookupWord(word);
    const entries = this.entriesByKey.get(cacheKey(lang, normalized)) ?? [];

    return {
      entries,
      found: entries.length > 0,
      query: {
        lang,
        normalized,
        word
      }
    };
  }
}
