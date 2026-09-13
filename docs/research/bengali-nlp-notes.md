# Bengali NLP Notes for BhashaLens

Synthesis of the papers in `papers/` plus primary data resources. Each section ends
with what it means for our code. Written 2026-09-13.

## TL;DR

- Bengali is agglutinative: a lemma can surface in 20+ inflected forms. Our current
  suffix list strips endings in arbitrary order and invents bad stems. The literature
  converges on **ordered suffix-marker sequences + dictionary verification**.
- Nouns inflect in a fixed slot order: `Lemma + Plural + Determiner + Case + Emphasis`
  (BanLemma, Table 10). Verbs need **two passes**: strip inflection, then map
  root → lemma with a dictionary (e.g. `গেলাম → যাওয়া`, not `গেলা`) (BanLemma, Table 2).
- Longest-suffix-first without a dictionary check causes **over-stemming**
  (`সরাইখানা` "inn" → `সরাই` ✗, `বার` "strong" → `বা` ✗) (Das et al. 2020).
- Bengali WordNet exists (8,679 synsets / 18,563 words) but the redistributable
  thesaurus we already support covers the same "Bengali synonyms" use case.
- We have no frequency data. `wordfreq` has a Bengali list, but its license forbids
  exporting it to CSV; build our own from an open corpus instead.
- A model (BanglaBERT/BanglaT5) is **not** needed to ship better lookups. It becomes
  useful only for POS-aware lemmatization and ranking once rules + data plateau.

## Papers collected

| File | Citation | Why it matters |
| --- | --- | --- |
| `2023-banlemma-lemmatizer.pdf` | Afrin et al. 2023, *BanLemma: A Word Formation Dependent Rule and Dictionary Based Bangla Lemmatizer*, Findings of EMNLP. [ACL](https://aclanthology.org/2023.findings-emnlp.240/) | The most complete modern rule+dictionary design. 96.36% accuracy. Gives the marker inventories and the exact stripping algorithm. |
| `2020-rule-based-bengali-stemmer.pdf` | Das, Pandit & Naskar 2020, *A Rule Based Lightweight Bengali Stemmer*, ICON. [ACL](https://aclanthology.org/2020.icon-main.55/) | 98.86% nouns / 99.75% verbs using longest-suffix matching validated against WordNet. Documents over-stemming failures and how to avoid them. |
| `2016-neural-lemmatizer-bengali.pdf` | Chakrabarty, Chaturvedi & Garain 2016, *A Neural Lemmatizer for Bengali*, LREC. [ACL](https://aclanthology.org/L16-1406/) | Attempt at an ML lemmatizer: 69.57% accuracy. Shows neural lemmatization without POS/context is *worse* than rules — supports our rules-first strategy. |
| `2009-fst-morphological-analyser-bengali.pdf` | Faridee & Tyers 2009, *Development of a morphological analyser for Bengali*, Free/Open-Source Rule-Based MT workshop. [ACL](https://aclanthology.org/2009.freeopmt-1.8/) | Finite-state morphotactics; open-source analyzer. Historical baseline for rule ordering. |
| `2010-indowordnet.pdf` | Bhattacharyya 2010, *IndoWordNet*, LREC. | Bengali WordNet built by expansion from Hindi WordNet: 8,679 synsets / 18,563 unique words. |
| `2022-indian-wordnets-princeton.pdf` | Kanojia, Patel & Bhattacharyya 2022, arXiv:2201.02977. | Releases 18 Indian wordnets bundled with Princeton WordNet mappings. Licensing points to the project site. |
| `2022-bengali-wordnet-enrichment.pdf` | Bhattacharyya & Jana 2022, *Towards Bengali WordNet Enrichment using Knowledge Graph Completion*, EURALI. | Automatic relation enrichment (Hits@1 0.412); not needed while human data exists. |
| `2022-banglabert.pdf` | Bhattacharjee et al. 2022, *BanglaBERT*, Findings of NAACL. | 110M-param ELECTRA model, Bangla2B+ 27.5 GB corpus, BLUB benchmark. The best "train later" base. |
| `2023-banglanlg-banglat5.pdf` | Bhattacharjee et al. 2023, *BanglaNLG and BanglaT5*, Findings of EACL. | seq2seq baseline for generation; relevant only if we ever generate definitions. |

## The linguistic rules we should implement

### Noun marker sequence (BanLemma §A.3, Tables 9–10)

```
surface = lemma + Plural + Determiner + Case + Emphasis
```

Slots are optional but ordered. Examples (from the paper):

| Surface | Lemma | Stripped sequence |
| --- | --- | --- |
| শিশুদেরটাতেও | শিশু | দের (plural) + টা (determiner) + তে (case) + ও (emphasis) |
| মায়েদেরকেও | মা | েয় (plural) + দের (plural) + কে (case) + ও (emphasis) |
| বইগুলিতেই | বই | গুলি (plural) + তে (case) + ই (emphasis) |
| মানু্ষকেই | মানুষ | কে (case) + ই (emphasis) |
| শিক্ষককে | শিক্ষক | কে (case) |
| জনগণই | জনগণ | ই (emphasis) |

Marker inventory:

- **Plural (37):** আবলি, কুল, গণ, গুচ্ছ, গুলা, গুলি, গুলো, গ্রাম, চয়, জাল, ত্রয়,
  দল, দাম, দিগ, দিগর, দের, দ্বয়, নিকর, নিচয়, পাল, পুঞ্জ, বর্গ, বৃন্দ, ব্রজ, মণ্ডল,
  মণ্ডলী, মহল, মালা, যূথ, রা, রাজি, রাশি, শ্রেণি, সমূহ, সহ, েরা, োচ্চয়.
- **Determiner (7):** খানা, খানি, টা, টি, টুকু, টুকুন, টে.
- **Case (12):** কার, কারে, কে, কের, তে, র, রে, ে (ে-কার), েতে, ের, য়, য়ে.
- **Emphasis (2):** ই, ও.
- **Adjective degree (2):** তর (comparative), তম (superlative).

### Verb two-pass rule (BanLemma §3, Table 2)

1. Strip a verbal ending (person / tense / aspect) to get the **root**.
2. Map root → **lemma** from a dictionary. `খেললাম → খেল → খেলা` works by adding
   আ, but `গেলাম → গে → যাওয়া` cannot be derived by rule — it needs the mapping.

Our current `root + "া"` heuristic is the right *first pass*; the missing piece is a
root→lemma table for irregular verbs. Kaikki/Wiktextract entries give us many verb
forms; a later importer can mine `forms[]` for root→lemma pairs. Until then, keep the
heuristic and rank exact-match candidates first.

### Over-stemming guard (Das et al. 2020)

Never accept a strip just because the suffix matched. A strip is only plausible if:

- the remaining stem is at least 2 Bengali characters;
- the stem is a dictionary word (API can verify this cheaply), or the strip is the
  only analysis and comes from a strongly-bound marker (case/emphasis);
- no shorter, better-ranked candidate exists.

Classic traps: সরাইখানা (inn) contains খানা; বার (strong) ends in র; মানু (in মানু্ষ)
is not the lemma. BanLemma resolves these by *continuing to try shorter markers when
the longest one produces a non-word*, and by treating words with no analysis as their
own lemma.

## Data sources surveyed

| Source | License | Shape | Verdict |
| --- | --- | --- | --- |
| Kaikki/Wiktextract bn (already imported) | CC BY-SA 4.0 | ~10.8k headwords / ~15k senses | In use (`seed:all`). |
| MinhasKamal/BengaliDictionary (already opt-in) | GPL-3.0 | bn→bn synonyms, ~439k word list, phonetic frequencies | In use (`bengali-thesaurus`). |
| `wordfreq` bn lists | Apache-2.0 code, **CC BY-SA 4.0 data**, README forbids CSV export | Zipf frequency per word | Do **not** redistribute. Use only to sanity-check our own frequencies. |
| IIT-KGP FIRE-2013 Bangla word frequencies | Research resource, license unclear | 327k inflected forms + counts in legacy romanization | Not directly usable (romanized, unclear license). |
| Bengali Wikipedia dump (`bnwiki-latest-pages-articles`) | CC BY-SA 4.0 | ~541 MB bz2, ~100M+ tokens | **Chosen** source for our own frequency list; `apps/api/scripts/build-frequencies.py` streams and counts it. |
| BanglaLM corpus | CC BY 4.0 | 40 GB raw | Alternative frequency source; heavy. |
| Bangladesh National Corpus (bdNC) | Government project terms | 3.6B words, 11.7M unique | Watch; not openly downloadable yet. |
| bdLexicon (corpus.bangla.gov.bd) | Government project terms | 954 words with lemma/POS/synonyms/translations | Small; useful for lemma validation tests. |
| Shobdo (InanXR/Shobdo) | Apache-2.0 | 45k words with meanings, pronunciation, POS, etymology | Strong future import candidate; verify data quality first. |
| tahmid02016/bangla-wordlist | Unlicense (public domain) | 454k bare words, no glosses | Useful as a spell/stem validation set, not as a dictionary. |
| soumenganguly/Bangla-Wordnet | GPL-3.0 | WordNet-style synsets | Optional opt-in source if we ever want synset grouping. |
| Universal Dependencies Bengali (if we adopt POS) | Varies | Treebanks | Future POS-aware lemmatization. |

## Action items (rules + data first)

- [x] Rewrite `packages/core/src/bengali.ts` around ordered marker sequences and the
  BanLemma noun/verb slots (this session).
- [x] Add a `word_frequencies` table + importer, and rank entries/candidates by
  frequency. Built from the Bengali Wikipedia dump (CC BY-SA 4.0) with a
  stdlib-only Python script; the generated file stays out of git, like Kaikki.
- [x] Mine verb root→lemma pairs from Kaikki `forms[]` into a small table so irregular
  verbs lemmatize (`গেলাম → যাওয়া`). Result: `word_forms` (53k mappings) takes
  precedence over rules for exact surfaces; morphology still covers unseen forms.
- [ ] Optional: add the GPL Bangla WordNet as an opt-in source for synset grouping.
- [ ] Add a POS tagger only when we have a frequency-backed reason to disambiguate;
  BanLemma shows wrong POS drops accuracy from 96.7% to 85–89%.

## Future ML work (when rules + data plateau)

Not needed now. If we reach for a model, use open Bengali checkpoints rather than
training from scratch:

- **Ranking / candidate selection:** BanglaBERT (110M) fine-tuned as a
  sentence-pair scorer, or a small fastText-based lemmatizer trained on BanLemma-style
  data. Training on Kaggle/Colab + artifacts on HF Hub is the intended path; the
  datasets above (BanglaLM, bdLexicon) are the inputs.
- **Transliteration/IPA generation:** a character-level seq2seq (BanglaT5) could fill
  missing pronunciations, but Kaikki already covers ~99% transliteration / ~76% IPA,
  so this is not a bottleneck.
- Guardrail: never let model output enter `dictionary_entries` directly. It goes to a
  review queue or a clearly-labeled cache, exactly like `translation_cache`.
