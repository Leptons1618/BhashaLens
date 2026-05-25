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

## Import Shape

The importer accepts:

- BhashaLens JSON arrays.
- Wiktextract-style JSONL records with `lang_code: "bn"`.
- TSV exports with `word`, `definition`, `transliteration`, `partOfSpeech`, `synonyms`, and `source` columns.

## Next Data Milestones

1. Import a Wiktionary-derived JSONL snapshot into SQLite.
2. Add a `dictionary_sources` table for license/provenance metadata.
3. Add a `word_frequencies` table so common Bengali forms rank first.
4. Add a review queue for entries without definitions or with low-confidence glosses.
5. Keep generated bulk files outside git and reproduce them with importer commands.
