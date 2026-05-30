/**
 * Registry of known bulk dictionary sources.
 *
 * Every importable bulk source is described here once so that the downloader
 * (`fetch-source.ts`), the importer (`import-dictionary.ts`), and the
 * `dictionary_sources` provenance table all agree on its identity, origin, and
 * license. Keep generated bulk files out of git and reproduce them from these
 * definitions instead.
 */

export type SourceFormat = "json" | "jsonl" | "tsv";

export interface DictionarySource {
  /** Stable key stored in `dictionary_entries.source` and `dictionary_sources.key`. */
  key: string;
  /** Human-readable title shown in provenance output. */
  title: string;
  /** Wiktextract/Kaikki-style record shape for the importer. */
  format: SourceFormat;
  /** Direct download URL for the raw extract, when one exists. */
  downloadUrl?: string;
  /** Local relative path (from repo root) the downloader writes to. */
  localPath: string;
  /** Page describing the dataset. */
  homepage: string;
  /** License short name (SPDX-style where possible). */
  license: string;
  /** License reference URL. */
  licenseUrl: string;
  /** Attribution string to keep with derived data. */
  attribution: string;
  /** One-line description of the dataset. */
  description: string;
}

export const SOURCE_REGISTRY: Record<string, DictionarySource> = {
  wiktextract: {
    key: "wiktextract",
    title: "Wiktionary (Bengali) via Kaikki / Wiktextract",
    format: "jsonl",
    downloadUrl: "https://kaikki.org/dictionary/Bengali/kaikki.org-dictionary-Bengali.jsonl",
    localPath: "downloads/bn-wiktextract.jsonl",
    homepage: "https://kaikki.org/dictionary/Bengali/",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution:
      "Definitions derived from English Wiktionary Bengali entries, extracted by Tatu Ylonen's Wiktextract (kaikki.org).",
    description:
      "Structured Bengali headwords with English glosses, romanization, IPA, usage examples, and synonyms. Same family of data that powers modern Yomitan dictionaries."
  },
  seed: {
    key: "seed",
    title: "BhashaLens curated seed",
    format: "json",
    localPath: "data/bn-dictionary/entries.json",
    homepage: "https://github.com/",
    license: "Project-internal",
    licenseUrl: "",
    attribution: "Hand-curated BhashaLens seed entries for local development.",
    description: "Small human-reviewable Bengali starter dictionary kept in git."
  }
};

export function getSource(key: string): DictionarySource | undefined {
  return SOURCE_REGISTRY[key];
}

export function resolveSourceByLocalPath(localPath: string): DictionarySource | undefined {
  const normalized = localPath.replace(/\\/g, "/").toLowerCase();
  return Object.values(SOURCE_REGISTRY).find((source) =>
    normalized.endsWith(source.localPath.replace(/\\/g, "/").toLowerCase())
  );
}
