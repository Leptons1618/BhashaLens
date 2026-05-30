import {
  BengaliAdapter,
  type DictionaryEntry,
  type LanguageAdapter,
  type LanguageCode,
  type MorphologyCandidate
} from "@bhashalens/core";
import cors from "@fastify/cors";
import { and, eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { performance } from "node:perf_hooks";
import { registerAdminRoutes } from "./admin.js";
import { closeDbContext, createDbContext, type DbContext } from "./db/client.js";
import { dictionaryEntries, translationCache, type DictionaryEntryRow } from "./db/schema.js";
import { createGoogleTranslator, type TranslateFn } from "./translate.js";
import { duckDuckGoSearch, googleSearch, type SearchFn, type SearchItem } from "./search.js";

interface LookupQuerystring {
  lang?: string;
  word?: string;
}

interface TranslateQuerystring {
  word?: string;
  from?: string;
  to?: string;
}

interface SearchQuerystring {
  q?: string;
  engines?: string;
}

export interface CreateServerOptions {
  adapters?: LanguageAdapter[];
  corsOrigin?: boolean | string | RegExp | Array<boolean | string | RegExp>;
  dbContext?: DbContext;
  logger?: boolean;
  /** Inject a translator (tests pass a stub); defaults to the Google gtx endpoint. */
  translate?: TranslateFn;
  /** Inject web-search engines (tests pass stubs). */
  search?: Partial<Record<"duckduckgo" | "google", SearchFn>>;
  /** If set, /admin routes require this token via the x-admin-token header. */
  adminToken?: string;
}

const SEARCH_LABELS: Record<string, string> = { duckduckgo: "DuckDuckGo", google: "Google" };

function buildAdapterRegistry(adapters: LanguageAdapter[]): Map<LanguageCode, LanguageAdapter> {
  return new Map(adapters.map((adapter) => [adapter.lang, adapter]));
}

function coerceArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }

  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return coerceArray(parsed);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function mapRow(row: DictionaryEntryRow): DictionaryEntry {
  return {
    definition: row.definition,
    examples: coerceArray(row.examples),
    ipa: row.ipa ?? undefined,
    lang: row.lang,
    normalized: row.normalized,
    partOfSpeech: row.partOfSpeech,
    source: row.source ?? undefined,
    synonyms: coerceArray(row.synonyms),
    transliteration: row.transliteration,
    word: row.word
  };
}

function readText(value: string | undefined): string | null {
  const text = value?.normalize("NFC").trim();
  return text && text.length > 0 ? text : null;
}

function lookupRows(dbContext: DbContext, lang: LanguageCode, normalized: string) {
  return dbContext.db
    .select()
    .from(dictionaryEntries)
    .where(and(eq(dictionaryEntries.lang, lang), eq(dictionaryEntries.normalized, normalized)))
    .limit(10)
    .all();
}

export async function createServer(options: CreateServerOptions = {}): Promise<FastifyInstance> {
  const ownsDb = !options.dbContext;
  const dbContext = options.dbContext ?? createDbContext();
  const adapters = buildAdapterRegistry(options.adapters ?? [new BengaliAdapter()]);
  const translate = options.translate ?? createGoogleTranslator();
  const searchEngines: Record<"duckduckgo" | "google", SearchFn> = {
    duckduckgo: options.search?.duckduckgo ?? duckDuckGoSearch,
    google: options.search?.google ?? googleSearch
  };
  const searchCache = new Map<string, { expiresAt: number; items: SearchItem[] }>();
  const SEARCH_TTL_MS = 30 * 60 * 1000;
  const app = Fastify({ logger: options.logger ?? true });

  await app.register(cors, {
    origin: options.corsOrigin ?? process.env.CORS_ORIGIN ?? "*"
  });

  app.get("/health", async () => ({
    ok: true,
    service: "bhashalens-api"
  }));

  app.get<{ Querystring: LookupQuerystring }>("/lookup", async (request, reply) => {
    const started = performance.now();
    const word = readText(request.query.word);
    const lang = (readText(request.query.lang) ?? "bn") as LanguageCode;
    const adapter = adapters.get(lang);

    if (!word) {
      return reply.code(400).send({
        error: "Missing required query parameter: word"
      });
    }

    if (!adapter) {
      return reply.code(400).send({
        error: `Unsupported language: ${lang}`
      });
    }

    const normalized = adapter.normalize(word);
    const morphology = adapter.analyzeMorphology?.(normalized);
    const candidates = morphology?.candidates.length
      ? morphology.candidates
      : [
          {
            confidence: 1,
            normalized,
            reason: "exact" as const
          }
        ];
    const emptyResponse = {
      entries: [],
      found: false,
      lookupWord: normalized,
      matchedCandidate: candidates[0],
      morphology,
      query: {
        lang,
        normalized,
        word
      }
    };

    if (!adapter.detect(normalized)) {
      return {
        ...emptyResponse,
        latencyMs: Math.round(performance.now() - started)
      };
    }

    let matchedCandidate: MorphologyCandidate | undefined;
    let rows: ReturnType<typeof lookupRows> = [];

    for (const candidate of candidates) {
      rows = lookupRows(dbContext, lang, candidate.normalized);
      if (rows.length > 0) {
        matchedCandidate = candidate;
        break;
      }
    }

    const entries = rows.map(mapRow);

    reply.header("cache-control", "public, max-age=300");
    return {
      entries,
      found: entries.length > 0,
      latencyMs: Math.round(performance.now() - started),
      lookupWord: matchedCandidate?.normalized ?? normalized,
      matchedCandidate: matchedCandidate ?? candidates[0],
      morphology,
      query: {
        lang,
        normalized,
        word
      }
    };
  });

  app.get<{ Querystring: TranslateQuerystring }>("/translate", async (request, reply) => {
    const started = performance.now();
    const word = readText(request.query.word);
    const from = readText(request.query.from) ?? "bn";
    const to = readText(request.query.to) ?? "en";

    if (!word) {
      return reply.code(400).send({ error: "Missing required query parameter: word" });
    }

    const normalized = word.normalize("NFC");

    const cached = dbContext.db
      .select()
      .from(translationCache)
      .where(
        and(
          eq(translationCache.lang, from),
          eq(translationCache.normalized, normalized),
          eq(translationCache.targetLang, to)
        )
      )
      .limit(1)
      .all();

    if (cached.length > 0) {
      reply.header("cache-control", "public, max-age=86400");
      return {
        cached: true,
        found: true,
        provider: cached[0]!.provider,
        query: { word, from, to },
        translation: cached[0]!.translation,
        latencyMs: Math.round(performance.now() - started)
      };
    }

    let translation: string | null = null;
    try {
      translation = await translate(normalized, from, to);
    } catch (error) {
      app.log.warn({ error }, "translate fallback failed");
    }

    if (!translation) {
      return {
        cached: false,
        found: false,
        provider: "google-translate",
        query: { word, from, to },
        translation: null,
        latencyMs: Math.round(performance.now() - started)
      };
    }

    dbContext.db
      .insert(translationCache)
      .values({ lang: from, normalized, targetLang: to, word, translation, provider: "google-translate" })
      .onConflictDoNothing()
      .run();

    return {
      cached: false,
      found: true,
      provider: "google-translate",
      query: { word, from, to },
      translation,
      latencyMs: Math.round(performance.now() - started)
    };
  });

  app.get<{ Querystring: SearchQuerystring }>("/search", async (request, reply) => {
    const query = readText(request.query.q);
    if (!query) {
      return reply.code(400).send({ error: "Missing required query parameter: q" });
    }

    const requested = (readText(request.query.engines) ?? "duckduckgo,google")
      .split(",")
      .map((engine) => engine.trim().toLowerCase())
      .filter((engine): engine is "duckduckgo" | "google" => engine === "duckduckgo" || engine === "google");

    const engines = requested.length > 0 ? requested : (["duckduckgo", "google"] as const);
    const now = Date.now();

    const groups = await Promise.all(
      engines.map(async (engine) => {
        const cacheKey = `${engine}:${query}`;
        const cached = searchCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
          return { engine, items: cached.items, label: SEARCH_LABELS[engine] ?? engine };
        }

        let items: SearchItem[] = [];
        try {
          items = await searchEngines[engine](query);
        } catch (error) {
          app.log.warn({ engine, error }, "web search failed");
        }

        if (items.length > 0) {
          searchCache.set(cacheKey, { expiresAt: now + SEARCH_TTL_MS, items });
        }
        return { engine, items, label: SEARCH_LABELS[engine] ?? engine };
      })
    );

    reply.header("cache-control", "public, max-age=600");
    return { groups, query };
  });

  registerAdminRoutes(app, dbContext, adapters.get("bn") ?? new BengaliAdapter(), {
    token: options.adminToken ?? process.env.ADMIN_TOKEN
  });

  app.addHook("onClose", async () => {
    if (ownsDb) {
      closeDbContext(dbContext);
    }
  });

  return app;
}
