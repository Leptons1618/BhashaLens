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

For larger dictionaries:

```bash
pnpm --filter @bhashalens/api migrate
pnpm --filter @bhashalens/api import:dictionary -- ../../data/bn-dictionary/entries.json --replace --source seed
pnpm --filter @bhashalens/api import:dictionary -- ../../downloads/bn-wiktextract.jsonl --source wiktextract
```

## MVP Behavior

- Detects Bengali Unicode in selected text and, optionally, clicked text nodes.
- Normalizes lookup terms with NFC before querying.
- Uses `/lookup?word=&lang=bn` for exact dictionary lookup.
- Shows a nonmodal popup near the selected word using Floating UI.
- Highlights the active word with an inline underline overlay.
- Caches lookup results in the content script for responsive repeat lookups.
- Uses conservative Bengali suffix stripping to try root-form fallback lookups.
- Adds quick links to Google Search, Bengali Wikipedia search, and Google Translate.
- Keeps language adapters and dictionary providers pluggable.

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
      "partOfSpeech": "adjective",
      "definition": "Good; pleasant; well.",
      "source": "seed"
    }
  ],
  "latencyMs": 4
}
```
