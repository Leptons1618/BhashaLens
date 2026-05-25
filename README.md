# BhashaLens

BhashaLens is a fast inline Bengali dictionary MVP. It lets users click or select Bengali text on any website and see a small popup with meaning, transliteration, and part of speech without leaving the page.

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

The API defaults to `http://localhost:8787`. Load the Plasmo extension dev build in Chromium, then click or select Bengali text on any website.

## MVP Behavior

- Detects Bengali Unicode in selected text and pointer text nodes.
- Normalizes lookup terms with NFC before querying.
- Uses `/lookup?word=&lang=bn` for exact dictionary lookup.
- Shows a nonmodal popup near the selected word using Floating UI.
- Caches lookup results in the content script for responsive repeat lookups.
- Keeps language adapters and dictionary providers pluggable.

The popup workflow borrows proven Yomitan/Yomichan concepts: selection monitoring, pointer word scanning, fast local state, cached lookups, keyboard dismissal, and no page navigation.

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
