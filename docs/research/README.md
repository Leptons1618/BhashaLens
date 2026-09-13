# BhashaLens Research

Research that drives the Bengali dictionary, morphology, and data pipeline.

## Contents

| File | What it is |
| --- | --- |
| [bengali-nlp-notes.md](bengali-nlp-notes.md) | Synthesized notes: papers, linguistic rules, data sources, and the action items derived from them. Start here. |
| `papers/` | Open-access PDFs collected for the notes. Named `YEAR-short-title.pdf`. |

## Method

1. Collect open-access papers (ACL Anthology, arXiv) and primary resources (corpus/dataset pages, GitHub repos).
2. Distill each into the rules or data it contributes to BhashaLens, with an explicit conflict check against what we already do.
3. Turn rules into code and tests (`packages/core/src/bengali.ts`), and resources into importer commands (`apps/api/src/db/`), keeping licenses and provenance in `dictionary_sources`.
4. Anything that needs a model (not a rule) goes to the "Future ML work" section instead of being half-built.
