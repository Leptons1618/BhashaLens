import type { LanguageAdapter, WordSpan } from "./types.js";

export const BENGALI_BLOCK_RE = /[\u0980-\u09FF]/u;

const BENGALI_WORD_CHAR_RE =
  /[\u0981-\u0983\u0985-\u098C\u098F-\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC\u09BE-\u09C4\u09C7-\u09C8\u09CB-\u09CD\u09D7\u09CE\u09DC-\u09DD\u09DF-\u09E3\u09F0-\u09F1\u200C\u200D]/u;

export function containsBengali(text: string): boolean {
  return BENGALI_BLOCK_RE.test(text);
}

export function normalizeBengali(text: string): string {
  return text.normalize("NFC").trim().replace(/\s+/g, " ");
}

function isBengaliWordChar(char: string | undefined): boolean {
  return typeof char === "string" && BENGALI_WORD_CHAR_RE.test(char);
}

function clampOffset(offset: number, textLength: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.min(Math.max(Math.trunc(offset), 0), textLength);
}

export class BengaliAdapter implements LanguageAdapter {
  readonly lang = "bn";
  readonly name = "Bengali";

  detect(text: string): boolean {
    return containsBengali(text);
  }

  normalize(text: string): string {
    return normalizeBengali(text);
  }

  extractWordAt(text: string, offset: number): WordSpan | null {
    if (!this.detect(text)) {
      return null;
    }

    let index = clampOffset(offset, text.length);
    if (!isBengaliWordChar(text[index]) && index > 0 && isBengaliWordChar(text[index - 1])) {
      index -= 1;
    }

    if (!isBengaliWordChar(text[index])) {
      return null;
    }

    let start = index;
    let end = index + 1;

    while (start > 0 && isBengaliWordChar(text[start - 1])) {
      start -= 1;
    }

    while (end < text.length && isBengaliWordChar(text[end])) {
      end += 1;
    }

    const raw = text.slice(start, end);
    const normalized = this.normalize(raw);

    if (normalized.length === 0 || !this.detect(normalized)) {
      return null;
    }

    return {
      end,
      lang: this.lang,
      normalized,
      start,
      text: raw
    };
  }
}

export const bengaliAdapter = new BengaliAdapter();
