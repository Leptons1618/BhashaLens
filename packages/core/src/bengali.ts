import type { LanguageAdapter, MorphologyAnalysis, MorphologyCandidate, WordSpan } from "./types.js";

export const BENGALI_BLOCK_RE = /[ঀ-৿]/u;

const BENGALI_WORD_CHAR_RE =
  /[ঁ-ঃঅ-ঌএ-ঐও-নপ-রলশ-হ়া-ৄে-ৈো-্ৗৎড়-ঢ়য়-ৣৰ-ৱ‌‍]/u;

interface BengaliSuffix {
  /** The suffix string to strip. */
  value: string;
  /** Verbal inflection — its stem can be lemmatized to an infinitive (root + "া"). */
  verb?: boolean;
}

/**
 * Bengali inflectional/derivational suffixes, grouped by role. Longest forms
 * are tried first (see SORTED_SUFFIXES) so multi-morpheme endings like "গুলোকে"
 * strip before "কে". Stripping is multi-pass, so layered forms such as
 * বইগুলোকে → বইগুলো → বই also resolve.
 */
const BENGALI_SUFFIXES: BengaliSuffix[] = [
  // Plural + classifier + case stacks
  { value: "গুলোকে" },
  { value: "গুলিকে" },
  { value: "গুলোতে" },
  { value: "গুলিতে" },
  { value: "গুলোয়" },
  { value: "গুলোর" },
  { value: "গুলির" },
  { value: "গুলো" },
  { value: "গুলি" },
  { value: "গুলা" },
  { value: "দেরকে" },
  { value: "দিগের" },
  { value: "দের" },
  { value: "েরা" },
  { value: "রা" },
  // Classifiers (definite) + case
  { value: "টাকে" },
  { value: "টিকে" },
  { value: "টাতে" },
  { value: "টিতে" },
  { value: "টার" },
  { value: "টির" },
  { value: "খানা" },
  { value: "খানি" },
  { value: "টুকু" },
  { value: "টা" },
  { value: "টি" },
  // Case / postpositional markers
  { value: "েতে" },
  { value: "ের" },
  { value: "কে" },
  { value: "রে" },
  { value: "তে" },
  { value: "য়ে" },
  { value: "য়" },
  // Emphatic particles
  { value: "ই" },
  { value: "ও" },
  // Verbal inflections (person / tense / aspect) — enable lemmatization
  { value: "েছিলাম", verb: true },
  { value: "েছিলেন", verb: true },
  { value: "েছিলে", verb: true },
  { value: "িয়েছি", verb: true },
  { value: "েছেন", verb: true },
  { value: "েছিস", verb: true },
  { value: "েছি", verb: true },
  { value: "েছে", verb: true },
  { value: "েছ", verb: true },
  { value: "ছিলাম", verb: true },
  { value: "ছিলেন", verb: true },
  { value: "ছিলে", verb: true },
  { value: "ছিল", verb: true },
  { value: "ছেন", verb: true },
  { value: "ছিস", verb: true },
  { value: "ছি", verb: true },
  { value: "ছে", verb: true },
  { value: "বেন", verb: true },
  { value: "বে", verb: true },
  { value: "বি", verb: true },
  { value: "বো", verb: true },
  { value: "লাম", verb: true },
  { value: "লেন", verb: true },
  { value: "লে", verb: true },
  { value: "লি", verb: true },
  { value: "ল", verb: true },
  { value: "িস", verb: true },
  { value: "েন", verb: true },
  { value: "ুন", verb: true },
  { value: "িয়া", verb: true },
  { value: "িয়ে", verb: true },
  { value: "ো", verb: true },
  // Causative / verbal-noun derivation
  { value: "ানো", verb: true },
  { value: "আনো", verb: true }
];

const SORTED_SUFFIXES = [...BENGALI_SUFFIXES].sort((a, b) => b.value.length - a.value.length);

// A base consonant (incl. ড় ঢ় য়). Lemmatizing to root + "া" only makes sense
// when the stem ends in a consonant, e.g. কর → করা, not করেছি → করেছিা.
const ENDS_WITH_CONSONANT_RE = /[ক-হড়ঢ়য়ৎ]$/u;

const MAX_STRIP_DEPTH = 2;
const MAX_CANDIDATES = 8;

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

  analyzeMorphology(text: string): MorphologyAnalysis {
    const surface = this.normalize(text);

    if (surface.length === 0 || !this.detect(surface)) {
      return {
        candidates: [],
        complexity: "unknown",
        notes: ["No Bengali word detected."],
        score: 0,
        surface
      };
    }

    const candidates = new Map<string, MorphologyCandidate>();
    candidates.set(surface, { confidence: 1, normalized: surface, reason: "exact" });
    const notes: string[] = [];
    let topLevelAffixLength = 0;

    const consider = (
      stem: string,
      confidence: number,
      reason: MorphologyCandidate["reason"],
      suffix?: string
    ): boolean => {
      const normalized = this.normalize(stem);
      if (normalized.length < 2 || !this.detect(normalized)) {
        return false;
      }

      const existing = candidates.get(normalized);
      if (!existing || existing.confidence < confidence) {
        candidates.set(normalized, { confidence: Number(confidence.toFixed(2)), normalized, reason, suffix });
      }
      return true;
    };

    // Multi-pass suffix stripping, longest suffix first, up to MAX_STRIP_DEPTH layers.
    let frontier: Array<{ confidence: number; depth: number; form: string }> = [
      { confidence: 1, depth: 0, form: surface }
    ];

    while (frontier.length > 0) {
      const next: typeof frontier = [];

      for (const node of frontier) {
        if (node.depth >= MAX_STRIP_DEPTH) {
          continue;
        }

        for (const suffix of SORTED_SUFFIXES) {
          if (!node.form.endsWith(suffix.value) || node.form.length <= suffix.value.length + 1) {
            continue;
          }

          const stem = this.normalize(node.form.slice(0, -suffix.value.length));
          if (stem.length < 2 || !this.detect(stem)) {
            continue;
          }

          const decay = Math.max(0.4, 0.82 - suffix.value.length * 0.04);
          const confidence = node.confidence * decay;

          if (consider(stem, confidence, "suffix-strip", suffix.value)) {
            if (node.depth === 0) {
              topLevelAffixLength = Math.max(topLevelAffixLength, suffix.value.length);
            }
            if (notes.length < 6) {
              notes.push(`Stripped "${suffix.value}" → "${stem}".`);
            }
            // Verb stems: also offer the dictionary/infinitive form (root + "া").
            if (suffix.verb && ENDS_WITH_CONSONANT_RE.test(stem)) {
              consider(`${stem}া`, confidence * 0.95, "lemma", suffix.value);
            }
            next.push({ confidence, depth: node.depth + 1, form: stem });
          }
        }
      }

      frontier = next;
    }

    const ordered = Array.from(candidates.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_CANDIDATES);
    const hasFallback = ordered.some((candidate) => candidate.reason !== "exact");

    // Morphological-complexity score: share of the surface that is inflectional
    // affix, plus a small bonus for how many distinct analyses are plausible.
    const affixRatio = Math.min(1, topLevelAffixLength / surface.length);
    const ambiguity = Math.min(1, (ordered.length - 1) / 5);
    const score = hasFallback
      ? Number(Math.min(0.98, 0.4 + affixRatio * 0.45 + ambiguity * 0.2).toFixed(2))
      : surface.length > 12
        ? 0.3
        : 0.14;

    const complexity: MorphologyAnalysis["complexity"] =
      surface.length > 12 ? "compound" : hasFallback ? "inflected" : "simple";

    return { candidates: ordered, complexity, notes, score, surface };
  }

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
