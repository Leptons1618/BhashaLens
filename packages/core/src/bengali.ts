import type { LanguageAdapter, MorphologyAnalysis, MorphologyCandidate, WordSpan } from "./types.js";

/**
 * Bengali morphology, implemented from the rules synthesized in
 * `docs/research/bengali-nlp-notes.md`.
 *
 * The key idea (BanLemma, EMNLP Findings 2023) is that inflections are not an
 * unordered pile of suffixes: they occupy slots in a fixed sequence.
 *
 *   noun:  lemma + Plural + Determiner + Case + Emphasis
 *
 * So stripping walks right-to-left through a small state machine, and the
 * candidates it produces keep the analysis attached ("কে + গুলো") instead of
 * pretending every suffix can follow every other. `analyzeMorphology` cannot
 * see the dictionary, so it emits an ordered fallback chain; the API resolves
 * the first candidate that exists (the dictionary-verification step in the
 * papers). Over-stemming traps like সরকার ("government" ending in কার) are left
 * to that resolution — exact matches always rank first.
 */

export const BENGALI_BLOCK_RE = /[ঀ-৿]/u;

const BENGALI_WORD_CHAR_RE =
  /[ঁ-ঃঅ-ঌএ-ঐও-নপ-রলশ-হ়া-ৄে-ৈো-্ৗৎড়-ঢ়য়-ৣৰ-ৱ‌‍]/u;

type MarkerClass = "emphasis" | "case" | "determiner" | "plural" | "degree";

interface BengaliMarker {
  /** The suffix string to strip. */
  value: string;
  /** Morphological slot this marker belongs to. */
  cls: MarkerClass;
}

/** Noun markers: 37 plurals, 7 determiners, 12 case, 2 emphasis (BanLemma Table 9). */
const NOUN_MARKERS: BengaliMarker[] = [
  // Plural / classifiers
  { value: "আবলি", cls: "plural" },
  { value: "কুল", cls: "plural" },
  { value: "গণ", cls: "plural" },
  { value: "গুচ্ছ", cls: "plural" },
  { value: "গুলা", cls: "plural" },
  { value: "গুলি", cls: "plural" },
  { value: "গুলো", cls: "plural" },
  { value: "গ্রাম", cls: "plural" },
  { value: "চয়", cls: "plural" },
  { value: "জাল", cls: "plural" },
  { value: "ত্রয়", cls: "plural" },
  { value: "দল", cls: "plural" },
  { value: "দাম", cls: "plural" },
  { value: "দিগ", cls: "plural" },
  { value: "দিগর", cls: "plural" },
  { value: "দের", cls: "plural" },
  { value: "দ্বয়", cls: "plural" },
  { value: "নিকর", cls: "plural" },
  { value: "নিচয়", cls: "plural" },
  { value: "পাল", cls: "plural" },
  { value: "পুঞ্জ", cls: "plural" },
  { value: "বর্গ", cls: "plural" },
  { value: "বৃন্দ", cls: "plural" },
  { value: "ব্রজ", cls: "plural" },
  { value: "মণ্ডল", cls: "plural" },
  { value: "মণ্ডলী", cls: "plural" },
  { value: "মহল", cls: "plural" },
  { value: "মালা", cls: "plural" },
  { value: "যূথ", cls: "plural" },
  { value: "রা", cls: "plural" },
  { value: "রাজি", cls: "plural" },
  { value: "রাশি", cls: "plural" },
  { value: "শ্রেণি", cls: "plural" },
  { value: "সমূহ", cls: "plural" },
  { value: "সহ", cls: "plural" },
  { value: "েরা", cls: "plural" },
  { value: "োচ্চয়", cls: "plural" },
  // Determiners (definite classifiers)
  { value: "খানা", cls: "determiner" },
  { value: "খানি", cls: "determiner" },
  { value: "টুকুন", cls: "determiner" },
  { value: "টুকু", cls: "determiner" },
  { value: "টা", cls: "determiner" },
  { value: "টি", cls: "determiner" },
  { value: "টে", cls: "determiner" },
  // Case / postpositional markers
  { value: "কারে", cls: "case" },
  { value: "কার", cls: "case" },
  { value: "কের", cls: "case" },
  { value: "রে", cls: "case" },
  { value: "তে", cls: "case" },
  { value: "ের", cls: "case" },
  { value: "কে", cls: "case" },
  { value: "য়ে", cls: "case" },
  { value: "য়", cls: "case" },
  { value: "র", cls: "case" },
  { value: "ে", cls: "case" },
  // Emphatic particles
  { value: "ই", cls: "emphasis" },
  { value: "ও", cls: "emphasis" },
  // Adjective degree
  { value: "তর", cls: "degree" },
  { value: "তম", cls: "degree" }
];

const SORTED_MARKERS = [...NOUN_MARKERS].sort((a, b) => b.value.length - a.value.length);

/**
 * Which slot may sit immediately to the left of a just-stripped one. Stripping
 * runs right-to-left, so after emphasis comes case/determiner/plural, and so on.
 * "degree" closes an analysis (nothing may precede তর/তম).
 */
const PRECEDING_CLASSES: Record<MarkerClass, MarkerClass[]> = {
  emphasis: ["case", "determiner", "plural"],
  case: ["determiner", "plural"],
  determiner: ["plural"],
  plural: ["plural"],
  degree: []
};

const ALL_CLASSES: MarkerClass[] = ["emphasis", "case", "determiner", "plural", "degree"];

/** Higher = the marker class alone is stronger evidence of inflection. */
const CLASS_WEIGHT: Record<MarkerClass, number> = {
  case: 0.86,
  emphasis: 0.8,
  plural: 0.78,
  determiner: 0.74,
  degree: 0.7
};

/**
 * Verbal inflections (person / tense / aspect / non-finite), compiled from
 * BanLemma Table 11 and the earlier suffix list. Longest first so প্রত্যাশিত
 * forms like "িয়েছিলাম" strip before "লাম". Verb lemmatization is still
 * two-pass: strip to the root, then heuristically add the infinitive আ.
 * Irregular roots (গেলাম → যাওয়া) need a root→lemma dictionary — noted in
 * docs/research/bengali-nlp-notes.md as future data work.
 */
const VERB_SUFFIXES: string[] = [
  "িয়েছিলাম",
  "িয়েছিলেন",
  "িয়েছিলে",
  "িয়েছিল",
  "িয়েছিস",
  "িয়েছেন",
  "িয়েছি",
  "িয়েছে",
  "িয়েছ",
  "েছিলাম",
  "েছিলেন",
  "েছিলে",
  "েছিল",
  "ছিলাম",
  "ছিলেন",
  "ছিলে",
  "ছিল",
  "েছেন",
  "েছিস",
  "েছি",
  "েছে",
  "েছো",
  "েছ",
  "ছেন",
  "ছিস",
  "ছি",
  "ছো",
  "ছে",
  "লাম",
  "লেন",
  "লি",
  "লে",
  "লো",
  "ল",
  "তাম",
  "তেন",
  "তি",
  "তে",
  "তো",
  "বেন",
  "বি",
  "বে",
  "বা",
  "বো",
  "েন",
  "ুন",
  "িস",
  "িয়া",
  "িয়ে",
  "ানো",
  "আনো",
  "ে",
  "ি",
  "ো"
].sort((a, b) => b.length - a.length);

// A base consonant (incl. ড় ঢ় য়). Lemmatizing to root + "া" only makes sense
// when the stem ends in a consonant, e.g. কর → করা, not করেছি → করেছিা.
const ENDS_WITH_CONSONANT_RE = /[ক-হড়ঢ়য়ৎ]$/u;

const MAX_STRIP_DEPTH = 4;
const MAX_FRONTIER = 40;
const MAX_CANDIDATES = 8;
const VERB_WEIGHT = 0.8;

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

    // Noun/adjective analyses: right-to-left marker chains that respect the
    // slot order rather than allowing every suffix after every other.
    let frontier: Array<{
      confidence: number;
      depth: number;
      form: string;
      last?: MarkerClass;
      stripped: string[];
    }> = [{ confidence: 1, depth: 0, form: surface, stripped: [] }];

    while (frontier.length > 0) {
      const next: typeof frontier = [];

      for (const node of frontier) {
        if (node.depth >= MAX_STRIP_DEPTH) {
          continue;
        }

        const allowed = node.last ? PRECEDING_CLASSES[node.last] : ALL_CLASSES;

        for (const marker of SORTED_MARKERS) {
          if (!allowed.includes(marker.cls) || !node.form.endsWith(marker.value)) {
            continue;
          }

          const stem = this.normalize(node.form.slice(0, -marker.value.length));
          if (stem.length < 2 || !this.detect(stem)) {
            continue;
          }

          // Longer markers are more specific evidence, and every extra layer of
          // stripping makes the analysis slightly less certain.
          const lengthBonus = 1 + Math.min(marker.value.length, 4) * 0.01;
          const depthDecay = node.depth === 0 ? 1 : 0.9;
          const confidence = node.confidence * CLASS_WEIGHT[marker.cls] * depthDecay * lengthBonus;
          const stripped = [...node.stripped, marker.value];

          if (consider(stem, confidence, "suffix-strip", stripped.join(" + "))) {
            if (node.depth === 0) {
              topLevelAffixLength = Math.max(topLevelAffixLength, marker.value.length);
            }
            if (notes.length < 6) {
              notes.push(`Stripped "${marker.value}" → "${stem}".`);
            }
            next.push({ confidence, depth: node.depth + 1, form: stem, last: marker.cls, stripped });
          }
        }
      }

      frontier = next.sort((a, b) => b.confidence - a.confidence).slice(0, MAX_FRONTIER);
    }

    // Verb analyses: strip the inflection, then offer the infinitive form.
    for (const suffix of VERB_SUFFIXES) {
      if (!surface.endsWith(suffix) || surface.length <= suffix.length + 1) {
        continue;
      }

      const root = this.normalize(surface.slice(0, -suffix.length));
      if (root.length < 2 || !this.detect(root)) {
        continue;
      }

      const confidence = VERB_WEIGHT * (1 + Math.min(suffix.length, 5) * 0.01);
      if (consider(root, confidence, "suffix-strip", suffix)) {
        topLevelAffixLength = Math.max(topLevelAffixLength, suffix.length);
        if (notes.length < 6) {
          notes.push(`Stripped verb ending "${suffix}" → "${root}".`);
        }
        if (ENDS_WITH_CONSONANT_RE.test(root)) {
          consider(`${root}া`, confidence * 0.95, "lemma", suffix);
        }
      }
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
