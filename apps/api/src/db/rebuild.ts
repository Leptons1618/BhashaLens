/**
 * One-command dictionary rebuild.
 *
 *   pnpm --filter @bhashalens/api seed:all
 *
 * Downloads the Kaikki/Wiktextract Bengali extract if it is missing, then
 * (re)seeds the curated entries and imports the full Wiktextract dataset on
 * top. Idempotent and safe to re-run. This replaces the previous multi-step
 * dance of fetch:source → migrate → seed → import:dictionary.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { downloadSource } from "./fetch-source.js";
import { importDictionaryFile } from "./import-dictionary.js";
import { seedDictionary } from "./seed.js";
import { SOURCE_REGISTRY } from "./sources.js";

function workspaceRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

async function rebuild(): Promise<void> {
  const source = SOURCE_REGISTRY.wiktextract;
  if (!source) {
    throw new Error("wiktextract source is not registered in sources.ts");
  }
  const filePath = resolve(workspaceRoot(), source.localPath);

  if (existsSync(filePath)) {
    console.log(`• Using existing extract: ${source.localPath}`);
  } else {
    console.log(`• Extract missing — downloading from ${source.downloadUrl}`);
    await downloadSource(source, false);
  }

  const seeded = await seedDictionary();
  console.log(`• Seeded ${seeded.count} curated entries (source: seed).`);

  const imported = await importDictionaryFile({ filePath, source: "wiktextract" });
  console.log(`• Imported ${imported.inserted} Wiktextract entries (${imported.parsed} parsed).`);

  console.log(`\n✓ Dictionary ready: ${seeded.count + imported.inserted} entries total. Start the API with: pnpm --filter @bhashalens/api dev`);
}

rebuild().catch((error) => {
  console.error("Rebuild failed:", error);
  process.exit(1);
});
