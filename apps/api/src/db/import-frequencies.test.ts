import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDbContext } from "./client.js";
import { importFrequencyFile } from "./import-frequencies.js";

describe("importFrequencyFile", () => {
  const previousDatabaseFile = process.env.DATABASE_FILE;

  afterEach(() => {
    if (previousDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = previousDatabaseFile;
    }
  });

  it("imports a ranked TSV, skipping provenance headers and bad lines", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bhashalens-freq-"));
    process.env.DATABASE_FILE = join(dir, "test.sqlite");
    const filePath = join(dir, "freq.tsv");
    writeFileSync(
      filePath,
      ["# source\tbnwiki", "# license\tCC BY-SA 4.0", "বাংলা\t100", "ভালো\t50", "নদী", "নদী\tnot-a-number"].join("\n")
    );

    const result = await importFrequencyFile({ filePath, lang: "bn", source: "bnwiki" });
    expect(result).toEqual({ imported: 2, parsed: 2 });

    const context = createDbContext();
    const rows = context.sqlite
      .prepare("SELECT word, count, rank, source FROM word_frequencies ORDER BY rank")
      .all() as Array<{ word: string; count: number; rank: number; source: string }>;
    context.sqlite.close();

    expect(rows).toEqual([
      { word: "বাংলা", count: 100, rank: 1, source: "bnwiki" },
      { word: "ভালো", count: 50, rank: 2, source: "bnwiki" }
    ]);
  });

  it("is idempotent across re-imports", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bhashalens-freq-"));
    process.env.DATABASE_FILE = join(dir, "test.sqlite");
    const filePath = join(dir, "freq.tsv");
    writeFileSync(filePath, "নদী\t10\n");

    await importFrequencyFile({ filePath, lang: "bn", source: "bnwiki" });
    writeFileSync(filePath, "নদী\t99\n");
    await importFrequencyFile({ filePath, lang: "bn", source: "bnwiki" });

    const context = createDbContext();
    const rows = context.sqlite.prepare("SELECT count FROM word_frequencies WHERE normalized = 'নদী'").all() as Array<{
      count: number;
    }>;
    context.sqlite.close();
    expect(rows).toEqual([{ count: 99 }]);
  });
});
