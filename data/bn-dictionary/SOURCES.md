# Bulk Dictionary Source Notes

These are candidate sources for growing BhashaLens beyond the curated seed. Review license, provenance, and schema quality before importing at scale.

## High-Priority Sources

- Wiktionary via Wiktextract/Kaikki JSONL: structured headwords, POS, glosses, synonyms, and pronunciations where available.
  - https://kaikki.org/dictionary/
  - https://dumps.wikimedia.org/bnwiktionary/
- Bengali WordNet: useful for synonym/synset expansion and semantic relations after license review.
  - https://sourceforge.net/projects/bengaliwordnet/
- BNLP: useful for tokenization, POS tagging, normalization experiments, and corpus processing. Treat it as processing infrastructure, not dictionary authority.
  - https://github.com/sagorbrur/bnlp

## Reproducible Pipeline

The Bengali Wiktextract snapshot is **not committed**. Reproduce it from the
source registry (`apps/api/src/db/sources.ts`). The one-command path:

```bash
pnpm seed:all   # downloads the extract if missing, reseeds, and imports it
```

Equivalent individual steps:

```bash
# 1. Download the Kaikki Bengali extract into downloads/ (+ a .manifest.json
#    recording url, bytes, sha256, retrieved-at, and license).
pnpm --filter @bhashalens/api fetch:source wiktextract

# 2. Seed the curated entries, then layer the bulk source on top.
pnpm --filter @bhashalens/api seed
pnpm --filter @bhashalens/api import:dictionary ../../downloads/bn-wiktextract.jsonl --source wiktextract
```

A current Kaikki snapshot yields ~10.8k headwords → ~15k sense-level entries,
with ~99% transliteration coverage, ~76% IPA, and usage examples on ~14%.

## Import Shape

The importer accepts:

- BhashaLens JSON arrays.
- Wiktextract/Kaikki JSONL records with `lang_code: "bn"`. Extracts:
  - definition from `senses[].glosses` (one entry per sense),
  - transliteration from `forms[]` tagged `romanization` (the field where Kaikki
    actually stores it — *not* `sounds[].roman`),
  - phonemic IPA from `sounds[]` (prefers `/…/` over `[..]`),
  - up to three usage examples per sense as `Bengali — English`,
  - synonyms from sense- and entry-level `synonyms[]`,
  - reader-friendly POS labels (`adj` → `adjective`, `name` → `proper noun`, …).
- TSV exports with `word`, `definition`, `transliteration`, `partOfSpeech`, `synonyms`, and `source` columns.

Every import upserts a row into `dictionary_sources` (key, title, homepage,
license, license_url, attribution, entry_count, imported_at) for provenance.

## Licensing

Wiktextract/Kaikki data derives from English Wiktionary and is **CC BY-SA 4.0**.
Keep it under the `wiktextract` source key; do not merge it into the
project-internal `seed` file, which has a different license posture.

## Next Data Milestones

1. ~~Import a Wiktionary-derived JSONL snapshot into SQLite.~~ ✅
2. ~~Add a `dictionary_sources` table for license/provenance metadata.~~ ✅
3. Add a `word_frequencies` table so common Bengali forms rank first.
4. Add a review queue for entries without definitions or with low-confidence glosses.
5. ~~Keep generated bulk files outside git and reproduce them with importer commands.~~ ✅ (`fetch:source`)
