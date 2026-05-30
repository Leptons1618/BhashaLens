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
pnpm seed:all          # download Wiktextract + seed + import (one command)
pnpm --filter @bhashalens/api dev
```

`pnpm seed:all` downloads the Bengali Wiktextract snapshot if it is missing
(~36 MB, intentionally not committed), reseeds the ~112 curated entries, and
imports the full dataset on top — growing the dictionary to **~15k entries**
with transliteration, IPA, usage examples, and synonyms. It is idempotent, so
re-run it any time. Each import is recorded in a `dictionary_sources` table with
its license (CC BY-SA 4.0). See [data/bn-dictionary/SOURCES.md](data/bn-dictionary/SOURCES.md).

The API defaults to `http://localhost:8787`. Then build/load the extension for
your browser (below) and select Bengali text on any website. The toolbar popup
switches the trigger between `Select`, `Click`, and `Both`.

> Prefer the individual steps? `pnpm --filter @bhashalens/api fetch:source wiktextract`,
> then `seed`, then `import:dictionary <file> --source wiktextract` still work.

## Browser builds (Chrome, Edge, Firefox)

Build production bundles for all three browsers:

```bash
pnpm ext:build         # → apps/extension/build/{chrome-mv3,edge-mv3,firefox-mv2}-prod
pnpm ext:package       # also zip each one for sharing/store upload
```

Or one at a time: `pnpm --filter @bhashalens/extension build:chrome` (`build:edge`, `build:firefox`).

Load the unpacked build:

- **Chrome / Edge** — open `chrome://extensions` (or `edge://extensions`),
  enable Developer mode, **Load unpacked** →
  `apps/extension/build/chrome-mv3-prod` (or `edge-mv3-prod`).
- **Firefox** — open `about:debugging#/runtime/this-firefox`,
  **Load Temporary Add-on** → pick any file inside
  `apps/extension/build/firefox-mv2-prod` (e.g. `manifest.json`).

For live-reload during development use `pnpm --filter @bhashalens/extension dev`
(Chrome) or `dev:firefox`, which build to the matching `*-dev` folder.

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

### Admin dictionary editor

With the API running, open `http://localhost:8787/admin` to browse, search,
add, edit, and delete entries by hand. It is backed by a small CRUD API
(`GET/POST /admin/entries`, `PUT/DELETE /admin/entries/:id`, `GET /admin/sources`).
New entries default to the `manual` source. Set `ADMIN_TOKEN` to require an
`x-admin-token` header (the page has a field that stores and sends it).
