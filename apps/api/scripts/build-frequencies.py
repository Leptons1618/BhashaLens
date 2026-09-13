#!/usr/bin/env python3
"""Build a Bengali word-frequency list from a MediaWiki XML dump.

Streams a bz2-compressed dump (no external dependencies), strips XML and the
noisiest wiki markup, counts Bengali word forms, and writes a ranked TSV:

    word<TAB>count

The list is used to rank dictionary entries and morphological candidates. It is
derived data: keep it out of git and reproduce it with this script.

Examples:
    python3 scripts/build-frequencies.py                       # stream bnwiki latest
    python3 scripts/build-frequencies.py --input dump.xml.bz2  # local dump
    python3 scripts/build-frequencies.py --max-bytes 20000000 --limit 5000  # quick sample
"""

from __future__ import annotations

import argparse
import bz2
import codecs
import collections
import datetime
import re
import sys
import urllib.request
import unicodedata

DUMP_URL = "https://dumps.wikimedia.org/bnwiki/latest/bnwiki-latest-pages-articles.xml.bz2"
SOURCE_KEY = "bnwiki"
LICENSE = "CC BY-SA 4.0"
# Wikimedia's robot policy requires a descriptive User-Agent with a contact point.
USER_AGENT = "BhashaLensFrequencyBuilder/0.1 (https://github.com/Leptons1618/BhashaLens)"
CHUNK_SIZE = 1 << 20
# Text held back between chunks so markup that straddles a chunk boundary is
# stripped as a whole instead of leaking fragments into the token stream.
HOLD_BACK = 8192

BENGALI_RUN = re.compile(r"[\u0980-\u09FF\u200c\u200d]+")
BENGALI_LETTER = re.compile(r"[\u0985-\u09B9\u09CE\u09DC-\u09DF\u09F0-\u09F1]")
ZERO_WIDTH = re.compile(r"[\u200c\u200d]")
COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
REF_RE = re.compile(r"<ref[^>]*>.*?</ref>", re.DOTALL | re.IGNORECASE)
TABLE_RE = re.compile(r"\{\|.*?\|\}", re.DOTALL)
TEMPLATE_RE = re.compile(r"\{\{[^{}]*\}\}", re.DOTALL)
URL_RE = re.compile(r"https?://\S+")
TAG_RE = re.compile(r"<[^>]*>")


def strip_markup(text: str) -> str:
    text = COMMENT_RE.sub(" ", text)
    text = REF_RE.sub(" ", text)
    text = TABLE_RE.sub(" ", text)
    # Innermost templates only; nested templates lose a few braces but their
    # Bengali parameters are noise for frequency purposes anyway.
    for _ in range(3):
        text = TEMPLATE_RE.sub(" ", text)
    text = URL_RE.sub(" ", text)
    text = TAG_RE.sub(" ", text)
    return text


def count_tokens(text: str, counts: collections.Counter[str]) -> None:
    for match in BENGALI_RUN.finditer(strip_markup(text)):
        token = unicodedata.normalize("NFC", ZERO_WIDTH.sub("", match.group(0)))
        if token and BENGALI_LETTER.search(token):
            counts[token] += 1


def iter_source_bytes(url: str | None, path: str | None, max_bytes: int):
    if path:
        stream = open(path, "rb")
    else:
        if not url:
            raise ValueError("either --input or --url is required")
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        stream = urllib.request.urlopen(request)  # noqa: S310 - explicit user-provided dump URL

    read = 0
    try:
        while True:
            chunk = stream.read(CHUNK_SIZE)
            if not chunk:
                break
            read += len(chunk)
            if max_bytes and read >= max_bytes:
                yield chunk[: len(chunk) - (read - max_bytes)]
                break
            yield chunk
    finally:
        stream.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", help="local bz2 dump to read instead of downloading")
    parser.add_argument("--url", default=DUMP_URL, help="dump URL to stream (default: bnwiki latest)")
    parser.add_argument("--output", default="../../downloads/bn-frequencies.tsv", help="TSV output path")
    parser.add_argument("--limit", type=int, default=200_000, help="keep at most this many words (0 = all)")
    parser.add_argument("--min-count", type=int, default=2, help="drop words below this count")
    parser.add_argument("--max-bytes", type=int, default=0, help="stop after N compressed bytes (debug)")
    args = parser.parse_args()

    counts: collections.Counter[str] = collections.Counter()
    decompressor = bz2.BZ2Decompressor()
    decoder = codecs.getincrementaldecoder("utf-8")("replace")
    pending = ""
    total_bytes = 0

    for chunk in iter_source_bytes(None if args.input else args.url, args.input, args.max_bytes):
        total_bytes += len(chunk)
        try:
            decoded = decoder.decode(decompressor.decompress(chunk))
        except EOFError:
            break
        pending += decoded
        if len(pending) > HOLD_BACK:
            split = len(pending) - HOLD_BACK
            count_tokens(pending[:split], counts)
            pending = pending[split:]

        if total_bytes % (20 * CHUNK_SIZE) < CHUNK_SIZE:
            print(f"  … {total_bytes / (1 << 20):.0f} MB read, {len(counts):,} distinct words", file=sys.stderr)

    try:
        pending += decoder.decode(b"", final=True)
    except (EOFError, ValueError):
        pass
    count_tokens(pending, counts)

    ranked = [(word, count) for word, count in counts.items() if count >= args.min_count]
    ranked.sort(key=lambda item: (-item[1], item[0]))
    if args.limit:
        ranked = ranked[: args.limit]

    with open(args.output, "w", encoding="utf-8") as handle:
        handle.write(f"# source\t{SOURCE_KEY}\n")
        handle.write(f"# license\t{LICENSE}\n")
        handle.write(f"# url\t{args.url}\n")
        handle.write(f"# built-at\t{datetime.datetime.now(datetime.UTC).isoformat(timespec='seconds')}\n")
        for word, count in ranked:
            handle.write(f"{word}\t{count}\n")

    print(f"✓ Wrote {len(ranked):,} words to {args.output} (from {total_bytes / (1 << 20):.0f} MB compressed)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
