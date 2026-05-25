# Bengali Dictionary Data

`entries.json` is a curated seed file for local MVP development. It should stay human-reviewable.

Large dictionary sources should be imported into SQLite through the API importer rather than committed as generated JSON.

## Native JSON Shape

```json
[
  {
    "word": "ভাষা",
    "transliteration": "bhasha",
    "partOfSpeech": "noun",
    "definition": "Language; a system of expression.",
    "synonyms": ["বাক্"],
    "source": "example"
  }
]
```

## Import Commands

```bash
pnpm --filter @bhashalens/api migrate
pnpm --filter @bhashalens/api import:dictionary -- ../../data/bn-dictionary/entries.json --replace --source seed
pnpm --filter @bhashalens/api import:dictionary -- ../../downloads/bn-wiktextract.jsonl --source wiktextract
pnpm --filter @bhashalens/api import:dictionary -- ../../downloads/custom.tsv --format tsv --source custom
```

The importer currently supports:

- Native BhashaLens JSON arrays.
- JSONL records shaped like Wiktextract/Kaikki output with `lang_code: "bn"`.
- TSV with headers such as `word`, `definition`, `transliteration`, `partOfSpeech`, `synonyms`, and `source`.

## Bulk Source Plan

1. Import Wiktionary-derived Bengali entries first because they are structured and definition-oriented.
2. Import Bengali WordNet-style synonym/synset data as a second provider or merge source after license review.
3. Use BNLP-style tokenization/POS tools to normalize external corpora, not as the authoritative dictionary.
4. Add a frequency table later so common words and common inflected forms rank above rare entries.
5. Keep provenance in the `source` field and avoid mixing incompatible licenses in the committed seed file.
