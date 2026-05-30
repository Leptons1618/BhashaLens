/**
 * Admin dictionary editor: CRUD over `dictionary_entries` plus a self-contained
 * web page served at `/admin` for browsing, searching, and hand-curating
 * entries. Intended for local/internal use. If `ADMIN_TOKEN` is set, every
 * `/admin/*` request must present it via the `x-admin-token` header (the page
 * stores and sends it automatically).
 */
import type { LanguageAdapter } from "@bhashalens/core";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DbContext } from "./db/client.js";
import { dictionaryEntries, dictionarySources, type DictionaryEntryRow } from "./db/schema.js";
import { ADMIN_PAGE } from "./admin-page.js";

interface EntryBody {
  definition?: string;
  examples?: unknown;
  ipa?: string;
  partOfSpeech?: string;
  source?: string;
  synonyms?: unknown;
  transliteration?: string;
  word?: string;
}

interface ListQuery {
  limit?: string;
  offset?: string;
  q?: string;
  source?: string;
}

export interface RegisterAdminOptions {
  token?: string;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** Accept arrays, or comma/newline-separated strings, from the form. */
function coerceStringArray(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const values = value.map(readString).filter((item): item is string => Boolean(item));
    return values.length > 0 ? values : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const values = value
      .split(/[\n,;]+/u)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return values.length > 0 ? values : null;
  }
  return null;
}

function mapRow(row: DictionaryEntryRow) {
  return {
    createdAt: row.createdAt,
    definition: row.definition,
    examples: Array.isArray(row.examples) ? row.examples : [],
    id: row.id,
    ipa: row.ipa ?? "",
    lang: row.lang,
    normalized: row.normalized,
    partOfSpeech: row.partOfSpeech,
    source: row.source ?? "",
    synonyms: Array.isArray(row.synonyms) ? row.synonyms : [],
    transliteration: row.transliteration,
    word: row.word
  };
}

interface ValidatedEntry {
  definition: string;
  examples: string[] | null;
  ipa: string | null;
  lang: string;
  normalized: string;
  partOfSpeech: string;
  source: string;
  synonyms: string[] | null;
  transliteration: string;
  word: string;
}

function validateEntry(body: EntryBody, adapter: LanguageAdapter): { error?: string; value?: ValidatedEntry } {
  const word = readString(body.word);
  const definition = readString(body.definition);

  if (!word) {
    return { error: "word is required" };
  }
  if (!adapter.detect(word)) {
    return { error: "word must contain Bengali text" };
  }
  if (!definition) {
    return { error: "definition is required" };
  }

  return {
    value: {
      definition,
      examples: coerceStringArray(body.examples),
      ipa: readString(body.ipa) ?? null,
      lang: "bn",
      normalized: adapter.normalize(word),
      partOfSpeech: readString(body.partOfSpeech) ?? "unknown",
      source: readString(body.source) ?? "manual",
      synonyms: coerceStringArray(body.synonyms),
      transliteration: readString(body.transliteration) ?? "",
      word
    }
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code: unknown }).code).startsWith("SQLITE_CONSTRAINT")
  );
}

export function registerAdminRoutes(
  app: FastifyInstance,
  dbContext: DbContext,
  adapter: LanguageAdapter,
  options: RegisterAdminOptions = {}
): void {
  const token = options.token?.trim() || undefined;

  const guard = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!token) {
      return;
    }
    const provided = readString(request.headers["x-admin-token"] as string | undefined) ?? readString((request.query as { token?: string }).token);
    if (provided !== token) {
      await reply.code(401).send({ error: "Unauthorized: missing or invalid admin token" });
    }
  };

  app.get("/admin", async (_request, reply) => {
    reply.header("content-type", "text/html; charset=utf-8");
    return ADMIN_PAGE;
  });

  app.get<{ Querystring: ListQuery }>("/admin/entries", { preHandler: guard }, async (request) => {
    const q = readString(request.query.q);
    const source = readString(request.query.source);
    const limit = Math.min(Math.max(Number.parseInt(request.query.limit ?? "50", 10) || 50, 1), 200);
    const offset = Math.max(Number.parseInt(request.query.offset ?? "0", 10) || 0, 0);

    const conditions = [eq(dictionaryEntries.lang, "bn")];
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          like(dictionaryEntries.word, pattern),
          like(dictionaryEntries.normalized, pattern),
          like(dictionaryEntries.transliteration, pattern),
          like(dictionaryEntries.definition, pattern)
        )!
      );
    }
    if (source) {
      conditions.push(eq(dictionaryEntries.source, source));
    }

    const where = and(...conditions);
    const totalRow = dbContext.db.select({ count: sql<number>`count(*)` }).from(dictionaryEntries).where(where).get();
    const rows = dbContext.db
      .select()
      .from(dictionaryEntries)
      .where(where)
      .orderBy(desc(dictionaryEntries.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    return { entries: rows.map(mapRow), limit, offset, total: totalRow?.count ?? 0 };
  });

  app.get("/admin/sources", { preHandler: guard }, async () => {
    const sources = dbContext.db.select().from(dictionarySources).all();
    const counts = dbContext.db
      .select({ count: sql<number>`count(*)`, source: dictionaryEntries.source })
      .from(dictionaryEntries)
      .groupBy(dictionaryEntries.source)
      .all();
    return { counts, sources };
  });

  app.post<{ Body: EntryBody }>("/admin/entries", { preHandler: guard }, async (request, reply) => {
    const { error, value } = validateEntry(request.body ?? {}, adapter);
    if (!value) {
      return reply.code(400).send({ error });
    }

    try {
      const [row] = dbContext.db.insert(dictionaryEntries).values(value).returning().all();
      return reply.code(201).send({ entry: row ? mapRow(row) : null });
    } catch (insertError) {
      if (isUniqueViolation(insertError)) {
        return reply.code(409).send({ error: "An identical entry (same word, part of speech, and definition) already exists." });
      }
      throw insertError;
    }
  });

  app.put<{ Body: EntryBody; Params: { id: string } }>("/admin/entries/:id", { preHandler: guard }, async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(id)) {
      return reply.code(400).send({ error: "Invalid id" });
    }

    const { error, value } = validateEntry(request.body ?? {}, adapter);
    if (!value) {
      return reply.code(400).send({ error });
    }

    try {
      const [row] = dbContext.db
        .update(dictionaryEntries)
        .set({
          definition: value.definition,
          examples: value.examples,
          ipa: value.ipa,
          normalized: value.normalized,
          partOfSpeech: value.partOfSpeech,
          source: value.source,
          synonyms: value.synonyms,
          transliteration: value.transliteration,
          word: value.word
        })
        .where(eq(dictionaryEntries.id, id))
        .returning()
        .all();

      if (!row) {
        return reply.code(404).send({ error: "Entry not found" });
      }
      return { entry: mapRow(row) };
    } catch (updateError) {
      if (isUniqueViolation(updateError)) {
        return reply.code(409).send({ error: "Another entry with the same word, part of speech, and definition already exists." });
      }
      throw updateError;
    }
  });

  app.delete<{ Params: { id: string } }>("/admin/entries/:id", { preHandler: guard }, async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(id)) {
      return reply.code(400).send({ error: "Invalid id" });
    }

    const [row] = dbContext.db.delete(dictionaryEntries).where(eq(dictionaryEntries.id, id)).returning().all();
    if (!row) {
      return reply.code(404).send({ error: "Entry not found" });
    }
    return { deleted: row.id };
  });
}
