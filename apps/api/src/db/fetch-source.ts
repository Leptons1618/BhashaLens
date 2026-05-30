/**
 * Reproducible bulk-source downloader.
 *
 * Downloads a registered dictionary source (see `sources.ts`) into the
 * gitignored `downloads/` directory and writes a `<file>.manifest.json`
 * alongside it recording the URL, size, sha256, and retrieval time. This keeps
 * large generated files out of git while making them reproducible:
 *
 *   pnpm --filter @bhashalens/api fetch:source -- wiktextract
 *   pnpm --filter @bhashalens/api fetch:source -- wiktextract --force
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { getSource, SOURCE_REGISTRY, type DictionarySource } from "./sources.js";

interface FetchOptions {
  force: boolean;
  key: string;
}

interface SourceManifest {
  key: string;
  title: string;
  url: string;
  localPath: string;
  bytes: number;
  sha256: string;
  retrievedAt: string;
  license: string;
  attribution: string;
}

function workspaceRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

function parseArgs(argv: string[]): FetchOptions {
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const key = positional[0];

  if (!key) {
    const available = Object.values(SOURCE_REGISTRY)
      .filter((source) => source.downloadUrl)
      .map((source) => `  ${source.key.padEnd(14)} ${source.title}`)
      .join("\n");
    throw new Error(`Usage: fetch:source -- <key> [--force]\n\nDownloadable sources:\n${available}`);
  }

  return { force: argv.includes("--force"), key };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function download(source: DictionarySource, force: boolean): Promise<SourceManifest> {
  if (!source.downloadUrl) {
    throw new Error(`Source "${source.key}" has no downloadUrl; it is shipped with the repo at ${source.localPath}.`);
  }

  const destination = resolve(workspaceRoot(), source.localPath);
  await mkdir(dirname(destination), { recursive: true });

  if (!force && (await fileExists(destination))) {
    throw new Error(`${source.localPath} already exists. Re-run with --force to overwrite.`);
  }

  console.log(`Downloading ${source.title}\n  from ${source.downloadUrl}\n  to   ${source.localPath}`);

  const response = await fetch(source.downloadUrl, { headers: { "user-agent": "BhashaLens/0.1 (+data pipeline)" } });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with HTTP ${response.status} ${response.statusText}`);
  }

  const hash = createHash("sha256");
  let bytes = 0;
  const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  body.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    hash.update(chunk);
  });

  await pipeline(body, createWriteStream(destination));

  const manifest: SourceManifest = {
    key: source.key,
    title: source.title,
    url: source.downloadUrl,
    localPath: source.localPath,
    bytes,
    sha256: hash.digest("hex"),
    retrievedAt: new Date().toISOString(),
    license: source.license,
    attribution: source.attribution
  };

  await writeFile(`${destination}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { force, key } = parseArgs(process.argv.slice(2));
  const source = getSource(key);
  if (!source) {
    throw new Error(`Unknown source "${key}". Known keys: ${Object.keys(SOURCE_REGISTRY).join(", ")}`);
  }

  const manifest = await download(source, force);
  const mb = (manifest.bytes / 1024 / 1024).toFixed(1);
  console.log(`\nDone. ${mb} MB, sha256 ${manifest.sha256.slice(0, 12)}…`);
  console.log(`Manifest written to ${manifest.localPath}.manifest.json`);
  console.log(`\nNext: pnpm --filter @bhashalens/api import:dictionary -- ../../${manifest.localPath} --source ${manifest.key}`);
}

export { download as downloadSource };
export type { SourceManifest };
