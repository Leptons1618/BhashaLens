# BhashaLens

BhashaLens is a fast inline Bengali dictionary MVP. It lets users select Bengali text, or optionally click Bengali words, on any website and see a small popup with meaning, transliteration, and part of speech without leaving the page.

The first version intentionally stays narrow: Unicode Bengali detection, NFC normalization, exact dictionary lookup, a lightweight popup workflow, a Plasmo browser extension, and a Fastify lookup API backed by SQLite and Drizzle ORM.

## Workspace

```text
apps/api            Fastify API, SQLite, Drizzle ORM
apps/extension      Plasmo extension with React popup UI and content script
packages/core       Framework-agnostic SDK and language/provider abstractions
packages/react      React hooks over the core SDK
data/bn-dictionary  Seed Bengali dictionary data
```

## Quick Start

```bash
pnpm install
pnpm build
pnpm seed
pnpm --filter @bhashalens/api dev
pnpm --filter @bhashalens/extension dev
```

The API defaults to `http://localhost:8787`. Load the Plasmo extension dev build in Chromium, then select Bengali text on any website. The extension popup can switch the trigger between `Select`, `Click`, and `Both`.

For the full dictionary, reproduce the Bengali Wiktextract snapshot from the
source registry (it is intentionally not committed):

```bash
pnpm --filter @bhashalens/api migrate
pnpm --filter @bhashalens/api fetch:source wiktextract        # downloads ~36 MB Kaikki extract + manifest
pnpm --filter @bhashalens/api seed                            # curated starter entries
pnpm --filter @bhashalens/api import:dictionary ../../downloads/bn-wiktextract.jsonl --source wiktextract
```

This grows the dictionary from ~112 curated entries to ~15k Wiktionary-derived
entries with transliteration, IPA, usage examples, and synonyms. Each import is
recorded in a `dictionary_sources` table with its license (CC BY-SA 4.0) and
attribution. See [data/bn-dictionary/SOURCES.md](data/bn-dictionary/SOURCES.md).

## MVP Behavior

- Detects Bengali Unicode in selected text and, optionally, clicked text nodes.
- Normalizes lookup terms with NFC before querying.
- Uses `/lookup?word=&lang=bn` for exact dictionary lookup.
- Shows a nonmodal popup near the selected word using Floating UI.
- Presents a Definer-style left tab rail: **Dictionary**, **Translate**, **Wikipedia**, **Web**.
- When no dictionary entry exists, auto-falls back to a cached machine translation
  (`/translate`) and offers a Bengali Wikipedia summary — clearly labelled as machine output.
- Highlights the active word with an inline underline overlay.
- Caches lookup results in the content script for responsive repeat lookups.
- Uses conservative Bengali suffix stripping to try root-form fallback lookups.
- Keeps language adapters, dictionary providers, and translation providers pluggable.

The popup workflow borrows proven Yomitan/Yomichan concepts: selection monitoring, pointer word scanning, fast local state, cached lookups, keyboard dismissal, and no page navigation.

Selection is the default trigger because it is more precise on arbitrary websites. Click mode only fires when the pointer is inside the rendered word rectangle, which prevents empty row space from selecting the nearest text node.

## API

```http
GET /lookup?word=ভালো&lang=bn
```

Response:

```json
{
  "query": { "word": "ভালো", "normalized": "ভালো", "lang": "bn" },
  "found": true,
  "entries": [
    {
      "word": "ভালো",
      "normalized": "ভালো",
      "lang": "bn",
      "transliteration": "bhalo",
      "ipa": "/bʱalo/",
      "partOfSpeech": "adjective",
      "definition": "Good; pleasant; well.",
      "examples": ["ভালো মানুষ — a good person"],
      "synonyms": ["উত্তম"],
      "source": "wiktextract"
    }
  ],
  "latencyMs": 4
}
```

### Translate fallback

For words with no dictionary entry, the client falls back to a cached machine
translation. The first request hits Google Translate; subsequent requests are
served from the `translation_cache` table (kept separate from curated data).

```http
GET /translate?word=সতর্কীকরণ&from=bn&to=en
```

```json
{ "found": true, "translation": "warning", "provider": "google-translate", "cached": false, "latencyMs": 382 }
```
