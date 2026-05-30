export type LanguageCode = "bn" | (string & {});

export type ActivationMode = "click" | "selection" | "both";

export type LookupStateStatus = "loading" | "ready" | "empty" | "error";

export interface WordSpan {
  end: number;
  lang: LanguageCode;
  normalized: string;
  start: number;
  text: string;
}

export interface MorphologyCandidate {
  confidence: number;
  normalized: string;
  reason: "exact" | "suffix-strip";
  suffix?: string;
}

export interface MorphologyAnalysis {
  candidates: MorphologyCandidate[];
  complexity: "simple" | "inflected" | "compound" | "unknown";
  notes: string[];
  score: number;
  surface: string;
}

export interface LanguageAdapter {
  analyzeMorphology?(text: string): MorphologyAnalysis;
  detect(text: string): boolean;
  extractWordAt(text: string, offset: number): WordSpan | null;
  lang: LanguageCode;
  name: string;
  normalize(text: string): string;
}

export interface DictionaryEntry {
  definition: string;
  examples?: string[];
  ipa?: string;
  lang: LanguageCode;
  normalized: string;
  partOfSpeech: string;
  source?: string;
  synonyms?: string[];
  transliteration: string;
  word: string;
}

export interface LookupQuery {
  lang: LanguageCode;
  normalized: string;
  word: string;
}

export interface LookupResponse {
  entries: DictionaryEntry[];
  found: boolean;
  latencyMs?: number;
  lookupWord?: string;
  matchedCandidate?: MorphologyCandidate;
  morphology?: MorphologyAnalysis;
  query: LookupQuery;
}

export interface DictionaryProvider {
  lookup(word: string, lang?: LanguageCode, signal?: AbortSignal): Promise<LookupResponse>;
}

export interface ExternalLookupLink {
  label: string;
  url: string;
}

export interface PopupLookupState {
  error?: string;
  externalLinks?: ExternalLookupLink[];
  lookupWord?: string;
  matchedCandidate?: MorphologyCandidate;
  morphology?: MorphologyAnalysis;
  normalized: string;
  response?: LookupResponse;
  status: LookupStateStatus;
  word: string;
}

export interface PopupController {
  contains?(node: Node): boolean;
  destroy(): void;
  hide(): void;
  show(anchor: DOMRect, state: PopupLookupState): void;
  update(state: PopupLookupState): void;
}

export interface LookupCandidate {
  highlightRects: DOMRect[];
  lang: LanguageCode;
  normalized: string;
  rect: DOMRect;
  source: "pointer" | "selection";
  word: string;
}
